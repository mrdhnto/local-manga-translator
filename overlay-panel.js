/**
 * Overlay Panel — On-screen cog button + sliding configuration panel.
 * Injected as a content script. Reads/writes chrome.storage.sync directly
 * so settings stay in sync with the popup.
 */
(function () {
  "use strict";

  // Avoid double-injection
  if (window.__mangaTLOverlayInjected) return;
  window.__mangaTLOverlayInjected = true;

  const PANEL_ID = "manga-tl-config-panel";
  const COG_ID = "manga-tl-config-cog";
  const BACKDROP_ID = "manga-tl-config-backdrop";

  let panelOpen = false;
  let cogEl = null;
  let panelEl = null;
  let backdropEl = null;

  // ── Build the Cog Button ──────────────────────────────────

  function createCogButton() {
    if (document.getElementById(COG_ID)) return;

    cogEl = document.createElement("div");
    cogEl.id = COG_ID;
    cogEl.title = "Manga Translator Settings";
    cogEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
    cogEl.addEventListener("click", togglePanel);
    document.body.appendChild(cogEl);
  }

  // ── Build the Backdrop ────────────────────────────────────

  function createBackdrop() {
    if (document.getElementById(BACKDROP_ID)) return;

    backdropEl = document.createElement("div");
    backdropEl.id = BACKDROP_ID;
    backdropEl.addEventListener("click", closePanel);
    document.body.appendChild(backdropEl);
  }

  // ── Build the Panel ───────────────────────────────────────

  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;

    panelEl = document.createElement("div");
    panelEl.id = PANEL_ID;

    panelEl.innerHTML = `
      <div class="mtl-panel-header">
        <div class="mtl-panel-header-left">
          <img class="mtl-panel-icon" src="${chrome.runtime.getURL('icons/icon48.png')}" alt="漫">
          <div>
            <div class="mtl-panel-title">Manga Translator</div>
            <div class="mtl-panel-subtitle">On-Screen Settings</div>
          </div>
        </div>
        <button class="mtl-panel-close" id="mtl-panel-close" title="Close panel">✕</button>
      </div>

      <div class="mtl-panel-body">

        <!-- Connection -->
        <div class="mtl-section">
          <div class="mtl-section-title">Connection</div>
          <div class="mtl-conn-row">
            <div class="mtl-conn-status">
              <span class="mtl-status-dot" id="mtl-status-dot"></span>
              <span class="mtl-status-text" id="mtl-status-text">Unknown</span>
            </div>
            <button class="mtl-btn mtl-btn-sm" id="mtl-btn-test">⚡ Test</button>
          </div>
        </div>

        <!-- API Settings -->
        <div class="mtl-section">
          <div class="mtl-section-header">
            <div class="mtl-section-title">API Settings</div>
            <button class="mtl-collapse-btn" data-target="mtl-api-body">▾</button>
          </div>
          <div class="mtl-section-body" id="mtl-api-body">
            <div class="mtl-field">
              <label>Schema</label>
              <select id="mtl-api-schema">
                <option value="openai">OpenAI (OpenAI Compatible)</option>
                <option value="lmstudio">LM Studio (Experimental)</option>
              </select>
            </div>
            <div class="mtl-field">
              <label>Host URL</label>
              <input type="text" id="mtl-api-host" placeholder="http://127.0.0.1:1234/v1" spellcheck="false">
            </div>
            <div class="mtl-field">
              <label>Model</label>
              <input type="text" id="mtl-api-model" list="mtl-api-model-list" placeholder="qwen2.5-vl-7b-instruct" spellcheck="false" autocomplete="off">
              <datalist id="mtl-api-model-list"></datalist>
            </div>
            <div class="mtl-field" style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 12px; margin-bottom: 8px;">
              <label for="mtl-use-api-key" style="margin-bottom: 0;">Use API Key</label>
              <label class="mtl-toggle-switch mtl-toggle-sm">
                <input type="checkbox" id="mtl-use-api-key">
                <span class="mtl-toggle-slider"></span>
              </label>
            </div>
            <div class="mtl-field" id="mtl-api-key-field" style="display: none;">
              <label>API Key</label>
              <input type="password" id="mtl-api-key" placeholder="sk-..." spellcheck="false">
            </div>
          </div>
        </div>

        <!-- Translation -->
        <div class="mtl-section">
          <div class="mtl-section-title">Translation</div>
          <div class="mtl-row">
            <div class="mtl-field mtl-flex-1">
              <label>From</label>
              <select id="mtl-translate-from">
                <option value="auto">Auto Detect</option>
                <option value="japanese">Japanese</option>
                <option value="english">English</option>
                <option value="chinese">Chinese</option>
                <option value="korean">Korean</option>
                <option value="indonesian">Indonesian</option>
              </select>
            </div>
            <div class="mtl-arrow">→</div>
            <div class="mtl-field mtl-flex-1">
              <label>To</label>
              <select id="mtl-translate-to">
                <option value="japanese">Japanese</option>
                <option value="english">English</option>
                <option value="chinese">Chinese</option>
                <option value="korean">Korean</option>
                <option value="indonesian">Indonesian</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Display -->
        <div class="mtl-section">
          <div class="mtl-section-title">Display</div>
          <div class="mtl-row">
            <div class="mtl-field mtl-flex-1">
              <label>Font</label>
              <select id="mtl-font-family">
                <option value="cc-wild-words">CC Wild Words</option>
                <option value="komikah">Komikah</option>
              </select>
            </div>
            <div class="mtl-field" style="width: 80px;">
              <label>Size</label>
              <div class="mtl-font-size-ctrl">
                <input type="range" id="mtl-font-size" min="8" max="32" value="16" step="1">
                <span class="mtl-font-size-val" id="mtl-font-size-val">16px</span>
              </div>
            </div>
          </div>
          <div class="mtl-row" style="margin-top: 6px;">
            <div class="mtl-field mtl-flex-1">
              <label>Min Width (px)</label>
              <input type="number" id="mtl-min-width" placeholder="300" min="0" step="10">
            </div>
            <div class="mtl-arrow">×</div>
            <div class="mtl-field mtl-flex-1">
              <label>Min Height (px)</label>
              <input type="number" id="mtl-min-height" placeholder="300" min="0" step="10">
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="mtl-section">
          <button class="mtl-btn mtl-btn-primary mtl-btn-full" id="mtl-btn-translate">
            🔄 Translate Page
          </button>
          <button class="mtl-btn mtl-btn-secondary mtl-btn-full" id="mtl-btn-debug" style="margin-top: 6px;">
            🐛 Open Debug Modal
          </button>
        </div>

      </div>
    `;

    document.body.appendChild(panelEl);

    // Wire close button
    document.getElementById("mtl-panel-close").addEventListener("click", closePanel);

    // Wire collapse buttons
    panelEl.querySelectorAll(".mtl-collapse-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-target");
        const target = document.getElementById(targetId);
        if (!target) return;
        const collapsed = btn.classList.toggle("mtl-collapsed");
        target.style.maxHeight = collapsed ? "0px" : target.scrollHeight + "px";
        target.style.overflow = "hidden";
      });
    });

    // Wire settings change handlers
    wireSettingsHandlers();

    // Load current settings
    loadPanelSettings();
  }

  // ── Wire Settings Handlers ─────────────────────────────────

  function wireSettingsHandlers() {
    const $ = id => document.getElementById(id);

    $("mtl-api-schema").addEventListener("change", (e) => {
      save("apiSchema", e.target.value);
      updatePanelHostPlaceholder();
    });
    $("mtl-api-host").addEventListener("change", (e) => save("apiHost", e.target.value.trim()));
    $("mtl-api-model").addEventListener("change", (e) => save("model", e.target.value.trim()));
    $("mtl-use-api-key").addEventListener("change", (e) => {
      save("useApiKey", e.target.checked);
      const keyField = $("mtl-api-key-field");
      keyField.style.display = e.target.checked ? "block" : "none";
      
      // Recalculate section height if expanded
      const apiBody = $("mtl-api-body");
      if (apiBody && apiBody.style.maxHeight && apiBody.style.maxHeight !== "0px") {
        apiBody.style.maxHeight = apiBody.scrollHeight + "px";
      }
    });
    $("mtl-api-key").addEventListener("change", (e) => save("apiKey", e.target.value.trim()));
    $("mtl-translate-from").addEventListener("change", (e) => save("translateFrom", e.target.value));
    $("mtl-translate-to").addEventListener("change", (e) => save("translateTo", e.target.value));
    $("mtl-font-family").addEventListener("change", (e) => save("defaultFont", e.target.value));

    $("mtl-font-size").addEventListener("input", (e) => {
      $("mtl-font-size-val").textContent = e.target.value + "px";
    });
    $("mtl-font-size").addEventListener("change", (e) => {
      save("defaultFontSize", e.target.value + "px");
    });

    $("mtl-min-width").addEventListener("change", (e) => save("minImageWidth", parseInt(e.target.value, 10) || 0));
    $("mtl-min-height").addEventListener("change", (e) => save("minImageHeight", parseInt(e.target.value, 10) || 0));

    // Test connection
    $("mtl-btn-test").addEventListener("click", async () => {
      const btn = $("mtl-btn-test");
      const dot = $("mtl-status-dot");
      const text = $("mtl-status-text");

      btn.disabled = true;
      btn.textContent = "⟳ ...";
      dot.className = "mtl-status-dot mtl-checking";
      text.textContent = "Checking...";

      try {
        const result = await chrome.runtime.sendMessage({ action: "testConnection" });
        if (result.success) {
          dot.className = "mtl-status-dot mtl-connected";
          text.textContent = "Connected";
          btn.textContent = `✓ ${result.models?.length || 0} model(s)`;

          // Populate datalist with retrieved models
          const modelList = $("mtl-api-model-list");
          if (modelList && result.models) {
            modelList.innerHTML = result.models.map(m => `<option value="${m}"></option>`).join("");
          }
        } else {
          dot.className = "mtl-status-dot mtl-disconnected";
          text.textContent = "Disconnected";
          btn.textContent = "✗ Failed";
        }
      } catch {
        dot.className = "mtl-status-dot mtl-disconnected";
        text.textContent = "Error";
        btn.textContent = "✗ Error";
      }

      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = "⚡ Test";
      }, 2000);
    });

    // Translate page
    $("mtl-btn-translate").addEventListener("click", async () => {
      const btn = $("mtl-btn-translate");
      btn.disabled = true;
      btn.textContent = "⟳ Translating...";

      try {
        // Call the exposed function from content.js
        if (typeof window.__mangaTLTranslatePage === "function") {
          window.__mangaTLTranslatePage();
        }
      } catch (err) {
        console.error("[MangaTL Overlay] Translate failed:", err);
      }

      closePanel();

      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = "🔄 Translate Page";
      }, 2000);
    });

    // Debug modal
    $("mtl-btn-debug").addEventListener("click", () => {
      if (window.MangaTLDebug) {
        window.MangaTLDebug.openModal();
      }
      closePanel();
    });
  }

  // ── Load Panel Settings ─────────────────────────────────────

  async function loadPanelSettings() {
    const $ = id => document.getElementById(id);
    let settings;

    try {
      settings = await chrome.storage.sync.get(null);
    } catch {
      return;
    }

    $("mtl-api-schema").value = settings.apiSchema || CONFIG.API_SCHEMA;
    $("mtl-api-host").value = settings.apiHost || CONFIG.API_HOST;
    $("mtl-api-model").value = settings.model || CONFIG.MODEL;
    
    const useApiKey = settings.useApiKey !== undefined ? settings.useApiKey : CONFIG.USE_API_KEY;
    $("mtl-use-api-key").checked = useApiKey;
    $("mtl-api-key").value = settings.apiKey || CONFIG.API_KEY || "";
    $("mtl-api-key-field").style.display = useApiKey ? "block" : "none";

    $("mtl-translate-from").value = settings.translateFrom || CONFIG.TRANSLATE_FROM;
    $("mtl-translate-to").value = settings.translateTo || CONFIG.TRANSLATE_TO;
    $("mtl-font-family").value = settings.defaultFont || CONFIG.DEFAULT_FONT;
    $("mtl-min-width").value = settings.minImageWidth !== undefined ? settings.minImageWidth : CONFIG.MIN_IMAGE_WIDTH;
    $("mtl-min-height").value = settings.minImageHeight !== undefined ? settings.minImageHeight : CONFIG.MIN_IMAGE_HEIGHT;

    const fontSize = parseInt(settings.defaultFontSize) || parseInt(CONFIG.DEFAULT_FONT_SIZE);
    $("mtl-font-size").value = fontSize;
    $("mtl-font-size-val").textContent = fontSize + "px";

    updatePanelHostPlaceholder();

    // Hide debug button if debug mode is disabled
    const debugBtn = $("mtl-btn-debug");
    if (debugBtn) {
      const debugEnabled = settings.debugMode !== undefined ? settings.debugMode : CONFIG.DEBUG_MODE;
      debugBtn.style.display = debugEnabled ? "" : "none";
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  async function save(key, value) {
    try {
      await chrome.storage.sync.set({ [key]: value });
    } catch (e) {
      console.warn("[MangaTL Overlay] Failed to save:", key, e);
    }
  }

  function updatePanelHostPlaceholder() {
    const schema = document.getElementById("mtl-api-schema");
    const host = document.getElementById("mtl-api-host");
    if (!schema || !host) return;
    host.placeholder = schema.value === "lmstudio"
      ? "http://127.0.0.1:1234/api/v1"
      : "http://127.0.0.1:1234/v1";
  }

  // ── Panel Open / Close ──────────────────────────────────────

  function openPanel() {
    if (panelOpen) return;
    panelOpen = true;

    if (!panelEl) createPanel();
    if (!backdropEl) createBackdrop();

    // Reload settings every time panel opens
    loadPanelSettings();

    panelEl.classList.add("mtl-panel-open");
    backdropEl.classList.add("mtl-backdrop-visible");
    cogEl.classList.add("mtl-cog-hidden");
  }

  function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;

    if (panelEl) panelEl.classList.remove("mtl-panel-open");
    if (backdropEl) backdropEl.classList.remove("mtl-backdrop-visible");
    if (cogEl) cogEl.classList.remove("mtl-cog-hidden");
  }

  function togglePanel() {
    panelOpen ? closePanel() : openPanel();
  }

  // ── Escape Key Handler ────────────────────────────────────

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panelOpen) {
      closePanel();
    }
  });

  // ── Show / Hide Cog ────────────────────────────────────────

  function setCogVisible(visible) {
    if (visible) {
      if (!cogEl) createCogButton();
      else cogEl.style.display = "";
    } else {
      if (cogEl) cogEl.style.display = "none";
      if (panelOpen) closePanel();
    }
  }

  // ── Listen for Messages from Popup ─────────────────────────

  // Expose for content.js to call
  window.MangaTLOverlay = {
    setCogVisible,
    closePanel,
    openPanel
  };

  // ── Initialize ─────────────────────────────────────────────

  async function init() {
    let settings;
    try {
      settings = await chrome.storage.sync.get(["showOverlayPanel", "debugMode"]);
    } catch {
      settings = {};
    }

    const showPanel = settings.showOverlayPanel !== undefined
      ? settings.showOverlayPanel
      : CONFIG.SHOW_OVERLAY_PANEL;

    if (showPanel) {
      createCogButton();
    }
  }

  // Wait for body to be available
  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }

})();
