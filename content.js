/**
 * Content Script — Image detection, loading overlays, and translation rendering.
 * Runs on all pages. Detects large images (likely manga panels), sends to LLM for translation,
 * and overlays translated text on top of the original image.
 */

(function () {
  "use strict";

  // Avoid double-injection
  if (window.__mangaTLInjected) return;
  window.__mangaTLInjected = true;

  const PROCESSED_ATTR = "data-manga-tl-processed";
  const WRAPPER_CLASS = "manga-tl-wrapper";
  const OVERLAY_CLASS = "manga-tl-overlay";
  const LOADING_CLASS = "manga-tl-loading";
  const REGION_CLASS = "manga-tl-region";

  let isEnabled = true;
  let fontsLoaded = false;

  // ── Load Custom Fonts ───────────────────────────────────────

  async function loadFonts() {
    if (fontsLoaded) return;
    try {
      for (const [key, fontInfo] of Object.entries(CONFIG.FONTS)) {
        const fontUrl = chrome.runtime.getURL(fontInfo.file);
        const font = new FontFace(fontInfo.family, `url(${fontUrl})`);
        const loaded = await font.load();
        document.fonts.add(loaded);
        console.log(`[MangaTL] Font loaded: ${fontInfo.family}`);
      }
      fontsLoaded = true;
    } catch (err) {
      console.error("[MangaTL] Failed to load fonts:", err);
    }
  }

  // ── Image Detection ─────────────────────────────────────────

  function isLikelyMangaImage(img) {
    if (img.hasAttribute(PROCESSED_ATTR)) return false;
    if (!img.complete || !img.naturalWidth) return false;

    const w = img.naturalWidth;
    const h = img.naturalHeight;

    // Must meet minimum dimensions
    if (w < CONFIG.MIN_IMAGE_WIDTH || h < CONFIG.MIN_IMAGE_HEIGHT) return false;

    // Skip tiny display sizes (icons being upscaled, etc.)
    const rect = img.getBoundingClientRect();
    if (rect.width < 200 || rect.height < 200) return false;

    // Skip images that are clearly not manga (very wide banners, etc.)
    // Manga panels are typically taller than wide or roughly square
    const aspectRatio = w / h;
    if (aspectRatio > 3) return false; // Skip ultra-wide banners

    return true;
  }

  function findMangaImages() {
    return Array.from(document.querySelectorAll("img")).filter(isLikelyMangaImage);
  }

  // ── Image to Base64 ─────────────────────────────────────────

  function imageToBase64(img) {
    try {
      const MAX_DIM = 2048; // Moderate limit for local LLM context windows
      let width = img.naturalWidth;
      let height = img.naturalHeight;

      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      
      // Ensure a white background
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, width, height);
      
      // User confirmed JPEG works better
      return canvas.toDataURL("image/jpeg", 0.9);
    } catch (err) {
      // Canvas tainted by CORS — return null, background.js will fetch directly
      console.warn("[MangaTL] Canvas tainted, will use URL fallback:", err.message);
      return null;
    }
  }

  // ── Wrapper & Loading Overlay ───────────────────────────────

  function ensureWrapper(img) {
    if (img.parentElement?.classList.contains(WRAPPER_CLASS)) {
      return img.parentElement;
    }

    const wrapper = document.createElement("div");
    wrapper.classList.add(WRAPPER_CLASS);

    // Copy positioning context from the image
    const imgStyle = window.getComputedStyle(img);
    wrapper.style.display = imgStyle.display === "inline" ? "inline-block" : imgStyle.display;
    wrapper.style.position = "relative";
    wrapper.style.width = img.offsetWidth + "px";
    wrapper.style.height = img.offsetHeight + "px";
    wrapper.style.margin = imgStyle.margin;
    wrapper.style.verticalAlign = imgStyle.verticalAlign;

    img.parentNode.insertBefore(wrapper, img);
    wrapper.appendChild(img);

    // Reset image margin since wrapper handles it
    img.style.margin = "0";
    img.style.display = "block";
    img.style.width = "100%";
    img.style.height = "auto";

    return wrapper;
  }

  function showLoading(wrapper) {
    // Remove existing loading overlay if any
    removeLoading(wrapper);

    const overlay = document.createElement("div");
    overlay.classList.add(LOADING_CLASS);
    overlay.innerHTML = `
      <div class="manga-tl-spinner"></div>
      <div class="manga-tl-loading-text">Translating...</div>
    `;
    wrapper.appendChild(overlay);
  }

  function removeLoading(wrapper) {
    const existing = wrapper.querySelector(`.${LOADING_CLASS}`);
    if (existing) existing.remove();
  }

  // ── Translation Overlay Rendering ───────────────────────────

  /**
   * Compute pixel box from a region's 1000-point coordinates.
   */
  function computeBox(region, displayWidth, displayHeight, img) {
    if (region.box_xmin_1000 !== undefined) {
      return {
        left:   (region.box_xmin_1000 / 1000) * displayWidth,
        top:    (region.box_ymin_1000 / 1000) * displayHeight,
        width:  ((region.box_xmax_1000 - region.box_xmin_1000) / 1000) * displayWidth,
        height: ((region.box_ymax_1000 - region.box_ymin_1000) / 1000) * displayHeight
      };
    }
    if (region.x_1000 !== undefined) {
      const cx = region.x_1000, cy = region.y_1000;
      const w = region.width_1000, h = region.height_1000;
      const left = (cx + w > 1050) ? ((cx - w / 2) / 1000) * displayWidth : (cx / 1000) * displayWidth;
      return { left, top: (cy / 1000) * displayHeight, width: (w / 1000) * displayWidth, height: (h / 1000) * displayHeight };
    }
    if (region.x_percent !== undefined) {
      return {
        left:   (region.x_percent / 100) * displayWidth,
        top:    (region.y_percent / 100) * displayHeight,
        width:  (region.width_percent / 100) * displayWidth,
        height: (region.height_percent / 100) * displayHeight
      };
    }
    const imgW = region.imgWidth || img.naturalWidth;
    const imgH = region.imgHeight || img.naturalHeight;
    const sx = displayWidth / imgW, sy = displayHeight / imgH;
    return { left: region.x * sx, top: region.y * sy, width: region.width * sx, height: region.height * sy };
  }

  /**
   * Apply positioning and font-scaling to a region element based on its bounding box.
   */
  function applyRegionStyle(regionEl, box, displayWidth, settings) {
    // Clamp position so the box doesn't render outside the image
    const left = Math.max(0, Math.min(box.left, displayWidth - 20));
    const top  = Math.max(0, box.top);

    // Use the actual bounding box dimensions as the container size.
    // Add horizontal padding to allow slightly wider boxes for translated text
    // (translations from CJK → English typically need more horizontal space).
    const expandedWidth = Math.max(box.width * 1.3, 60);

    regionEl.style.left   = left + "px";
    regionEl.style.top    = top + "px";
    regionEl.style.width  = expandedWidth + "px";
    regionEl.style.height = box.height + "px";

    // Font settings
    const fontKey = settings.defaultFont || CONFIG.DEFAULT_FONT;
    const fontInfo = CONFIG.FONTS[fontKey];
    const fontFamily = fontInfo ? fontInfo.family : "sans-serif";
    const baseFontSize = parseInt(settings.defaultFontSize || CONFIG.DEFAULT_FONT_SIZE, 10) || 16;

    regionEl.style.fontFamily = `"${fontFamily}", sans-serif`;

    // Auto-scale: shrink font if the text is too long for the bounding box area.
    // Estimate: average character width is ~0.6 × font size, line height ~1.35.
    const text = regionEl.textContent || "";
    const areaAvailable = expandedWidth * box.height;
    const charsPerLine = Math.max(1, Math.floor(expandedWidth / (baseFontSize * 0.55)));
    const linesNeeded = Math.ceil(text.length / charsPerLine);
    const heightNeeded = linesNeeded * baseFontSize * 1.35;

    let fontSize = baseFontSize;
    if (heightNeeded > box.height && box.height > 10) {
      // Scale down proportionally, with a floor of 9px
      fontSize = Math.max(9, Math.floor(baseFontSize * (box.height / heightNeeded)));
    }

    regionEl.style.fontSize = fontSize + "px";
  }

  function renderTranslationOverlay(wrapper, img, regions, settings) {
    // Remove previous translation overlay
    const existing = wrapper.querySelector(`.${OVERLAY_CLASS}`);
    if (existing) existing.remove();

    // Run region post-processor to fix/merge/deduplicate LLM output
    if (window.MangaTLRegionProcessor) {
      regions = window.MangaTLRegionProcessor.processRegions(regions);
    }

    const overlay = document.createElement("div");
    overlay.classList.add(OVERLAY_CLASS);

    // Store processed region data for resize recalculation
    overlay.__mangaTLRegions = regions;
    overlay.__mangaTLSettings = settings;

    // Get the displayed size of the image
    const displayWidth = img.offsetWidth;
    const displayHeight = img.offsetHeight;

    regions.forEach((region, index) => {
      const regionEl = document.createElement("div");
      regionEl.classList.add(REGION_CLASS);
      regionEl.setAttribute("data-region-index", index);

      const box = computeBox(region, displayWidth, displayHeight, img);

      // Set translated text first (needed for font-size calculation)
      const translatedText = region.toLang?.text || region.toLang?.script || region.translated_text || "";
      regionEl.textContent = translatedText;

      // Tooltip with original text
      const originalText = region.fromLang?.text || region.fromLang?.script || region.original_text || "";
      regionEl.title = `Original: ${originalText}`;

      // Apply positioning, sizing, and auto-scaled font
      applyRegionStyle(regionEl, box, displayWidth, settings);

      // Animation delay for staggered fade-in
      regionEl.style.animationDelay = (index * 0.05) + "s";

      overlay.appendChild(regionEl);
    });

    wrapper.appendChild(overlay);
  }

  // ── Toggle Overlays ─────────────────────────────────────────

  function setOverlaysVisible(visible) {
    document.querySelectorAll(`.${OVERLAY_CLASS}`).forEach(el => {
      el.style.display = visible ? "" : "none";
    });
  }

  // ── Remove All Overlays ─────────────────────────────────────

  function removeAllOverlays() {
    document.querySelectorAll(`.${WRAPPER_CLASS}`).forEach(wrapper => {
      const img = wrapper.querySelector("img");
      if (img) {
        img.removeAttribute(PROCESSED_ATTR);
        // Unwrap
        wrapper.parentNode.insertBefore(img, wrapper);
        wrapper.remove();
      }
    });
  }

  // ── Translate a Single Image ────────────────────────────────

  async function translateImage(img) {
    if (img.hasAttribute(PROCESSED_ATTR)) return;
    img.setAttribute(PROCESSED_ATTR, "true");

    const settings = await new Promise(resolve => {
      chrome.runtime.sendMessage({ action: "getSettings" }, resolve);
    });

    if (settings?.minImageWidth !== undefined) CONFIG.MIN_IMAGE_WIDTH = parseInt(settings.minImageWidth, 10);
    if (settings?.minImageHeight !== undefined) CONFIG.MIN_IMAGE_HEIGHT = parseInt(settings.minImageHeight, 10);

    if (!settings.enabled) {
      img.removeAttribute(PROCESSED_ATTR);
      return;
    }

    await loadFonts();

    const wrapper = ensureWrapper(img);
    showLoading(wrapper);

    // Convert to base64
    const base64 = imageToBase64(img);

    const message = {
      action: "translateImage",
      imageBase64: base64,
      imageUrl: base64 ? null : img.src
    };

    try {
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });

      if (window.MangaTLDebug) {
        window.MangaTLDebug.saveLog(result, img, settings);
      }

      removeLoading(wrapper);

      if (result.success && result.data?.regions?.length > 0) {
        renderTranslationOverlay(wrapper, img, result.data.regions, settings);
        console.log(`[MangaTL] Translated ${result.data.regions.length} regions`);
      } else if (!result.success) {
        console.error("[MangaTL] Translation failed:", result.error);
        // Show error indicator
        showErrorIndicator(wrapper, result.error);
      } else {
        console.log("[MangaTL] No text regions found in image");
      }
    } catch (err) {
      removeLoading(wrapper);
      console.error("[MangaTL] Error:", err);
      showErrorIndicator(wrapper, err.message);
    }
  }

  function showErrorIndicator(wrapper, errorMsg) {
    const indicator = document.createElement("div");
    indicator.classList.add("manga-tl-error-indicator");
    indicator.textContent = "⚠ Translation failed";
    indicator.title = errorMsg;
    wrapper.appendChild(indicator);

    // Auto-remove after 5 seconds
    setTimeout(() => indicator.remove(), 5000);
  }

  // ── Scan & Translate All Images ─────────────────────────────

  let isTranslatingQueue = false;

  async function scanAndTranslate() {
    if (isTranslatingQueue) return;

    const settings = await new Promise(resolve => {
      chrome.runtime.sendMessage({ action: "getSettings" }, resolve);
    });

    if (settings?.minImageWidth !== undefined) CONFIG.MIN_IMAGE_WIDTH = parseInt(settings.minImageWidth, 10);
    if (settings?.minImageHeight !== undefined) CONFIG.MIN_IMAGE_HEIGHT = parseInt(settings.minImageHeight, 10);

    if (!settings?.enabled) return;

    isTranslatingQueue = true;

    try {
      while (true) {
        const images = findMangaImages();
        if (images.length === 0) break;

        // Sort images by area (width * height) descending to start with largest first
        images.sort((a, b) => {
          const areaA = a.naturalWidth * a.naturalHeight;
          const areaB = b.naturalWidth * b.naturalHeight;
          return areaB - areaA;
        });

        console.log(`[MangaTL] Found ${images.length} manga image(s) to translate. Translating largest first.`);

        // Translate sequentially to avoid overloading the LLM
        for (const img of images) {
          await translateImage(img);
        }
      }
    } finally {
      isTranslatingQueue = false;
    }
  }

  // ── MutationObserver for Dynamic Content ────────────────────

  function startObserver() {
    const observer = new MutationObserver((mutations) => {
      let hasNewImages = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeName === "IMG" || (node.querySelector && node.querySelector("img"))) {
            hasNewImages = true;
            break;
          }
        }
        if (hasNewImages) break;
      }

      if (hasNewImages) {
        // Debounce — wait for images to load
        clearTimeout(window.__mangaTLObserverTimeout);
        window.__mangaTLObserverTimeout = setTimeout(() => {
          scanAndTranslate();
        }, 1000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // ── Handle Window Resize (re-position overlays) ─────────────

  function handleResize() {
    document.querySelectorAll(`.${WRAPPER_CLASS}`).forEach(wrapper => {
      const img = wrapper.querySelector("img");
      const overlay = wrapper.querySelector(`.${OVERLAY_CLASS}`);
      if (!img || !overlay) return;

      // Update wrapper size
      wrapper.style.width = img.offsetWidth + "px";
      wrapper.style.height = img.offsetHeight + "px";

      const displayWidth = img.offsetWidth;
      const displayHeight = img.offsetHeight;
      const regions = overlay.__mangaTLRegions;
      const settings = overlay.__mangaTLSettings || {};

      if (!regions) return;

      overlay.querySelectorAll(`.${REGION_CLASS}`).forEach(regionEl => {
        const idx = parseInt(regionEl.getAttribute("data-region-index"));
        const region = regions[idx];
        if (!region) return;

        const box = computeBox(region, displayWidth, displayHeight, img);
        applyRegionStyle(regionEl, box, displayWidth, settings);
      });
    });
  }

  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(handleResize, 250);
  });

  // ── Message Listener from Popup / Background ───────────────

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
      case "translatePage":
        // Reset processed flags to allow re-scan
        document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach(el => {
          el.removeAttribute(PROCESSED_ATTR);
        });
        removeAllOverlays();
        scanAndTranslate();
        sendResponse({ success: true });
        break;

      case "toggleTranslation":
        isEnabled = request.enabled;
        if (!isEnabled) {
          removeAllOverlays();
        } else {
          scanAndTranslate();
        }
        sendResponse({ success: true });
        break;

      case "showOverlays":
        setOverlaysVisible(true);
        sendResponse({ success: true });
        break;

      case "hideOverlays":
        setOverlaysVisible(false);
        sendResponse({ success: true });
        break;

      case "openDebugModal":
        if (window.MangaTLDebug) {
          window.MangaTLDebug.openModal();
        }
        sendResponse({ success: true });
        break;

      case "toggleOverlayPanel":
        if (window.MangaTLOverlay) {
          window.MangaTLOverlay.setCogVisible(request.enabled);
        }
        sendResponse({ success: true });
        break;
    }
    return true;
  });

  // ── Expose for Overlay Panel ───────────────────────────────
  // The overlay panel runs in the same content script context,
  // so it can call these directly.

  window.__mangaTLTranslatePage = function () {
    document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach(el => {
      el.removeAttribute(PROCESSED_ATTR);
    });
    removeAllOverlays();
    scanAndTranslate();
  };



  // ── Initialize ─────────────────────────────────────────────

  async function init() {
    const settings = await new Promise(resolve => {
      chrome.runtime.sendMessage({ action: "getSettings" }, resolve);
    });

    if (settings?.minImageWidth !== undefined) CONFIG.MIN_IMAGE_WIDTH = parseInt(settings.minImageWidth, 10);
    if (settings?.minImageHeight !== undefined) CONFIG.MIN_IMAGE_HEIGHT = parseInt(settings.minImageHeight, 10);

    isEnabled = settings?.enabled ?? true;

    if (isEnabled) {
      // Wait a bit for page images to fully load
      setTimeout(() => {
        scanAndTranslate();
        startObserver();
      }, 1500);
    } else {
      // Still start observer in case user enables later
      startObserver();
    }
  }

  // Kick off when DOM is stable
  if (document.readyState === "complete") {
    init();
  } else {
    window.addEventListener("load", init);
  }

})();
