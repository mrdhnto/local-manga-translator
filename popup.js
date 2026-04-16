/**
 * Popup Script — Settings management, connection testing, and error log display.
 */

document.addEventListener("DOMContentLoaded", async () => {

  // ── DOM Elements ──────────────────────────────────────────

  const toggleEnabled    = document.getElementById("toggle-enabled");
  const statusDot        = document.getElementById("status-dot");
  const statusText       = document.getElementById("status-text");
  const btnTestConn      = document.getElementById("btn-test-connection");
  const apiSchema        = document.getElementById("api-schema");
  const apiHost          = document.getElementById("api-host");
  const apiModel         = document.getElementById("api-model");
  const translateFrom    = document.getElementById("translate-from");
  const translateTo      = document.getElementById("translate-to");
  const fontFamily       = document.getElementById("font-family");
  const fontSizeSlider   = document.getElementById("font-size-slider");
  const fontSizeValue    = document.getElementById("font-size-value");
  const minImageWidth    = document.getElementById("min-image-width");
  const minImageHeight   = document.getElementById("min-image-height");
  const btnTranslatePage = document.getElementById("btn-translate-page");
  const btnClearLog      = document.getElementById("btn-clear-log");
  const btnDebugModal    = document.getElementById("btn-debug-modal");
  const errorLogEl       = document.getElementById("error-log");

  // ── Collapsible Sections ──────────────────────────────────

  document.querySelectorAll(".collapse-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const target = document.getElementById(targetId);
      if (!target) return;

      const isCollapsed = btn.classList.toggle("collapsed");
      target.style.maxHeight = isCollapsed ? "0px" : target.scrollHeight + "px";
      target.style.overflow = "hidden";
    });
  });

  // ── Load Settings ─────────────────────────────────────────

  async function loadSettings() {
    const settings = await chrome.storage.sync.get(null);

    toggleEnabled.checked      = settings.enabled !== undefined ? settings.enabled : true;
    apiSchema.value            = settings.apiSchema     || CONFIG.API_SCHEMA;
    apiHost.value              = settings.apiHost       || CONFIG.API_HOST;
    apiModel.value             = settings.model         || CONFIG.MODEL;
    
    updateHostPlaceholder();
    translateFrom.value        = settings.translateFrom || CONFIG.TRANSLATE_FROM;
    translateTo.value          = settings.translateTo   || CONFIG.TRANSLATE_TO;
    fontFamily.value           = settings.defaultFont   || CONFIG.DEFAULT_FONT;
    minImageWidth.value        = settings.minImageWidth !== undefined ? settings.minImageWidth : CONFIG.MIN_IMAGE_WIDTH;
    minImageHeight.value       = settings.minImageHeight !== undefined ? settings.minImageHeight : CONFIG.MIN_IMAGE_HEIGHT;

    const fontSize = parseInt(settings.defaultFontSize) || parseInt(CONFIG.DEFAULT_FONT_SIZE);
    fontSizeSlider.value       = fontSize;
    fontSizeValue.textContent  = fontSize + "px";
  }

  // ── Save Settings ─────────────────────────────────────────

  async function saveSetting(key, value) {
    await chrome.storage.sync.set({ [key]: value });
  }

  // ── Auto-Save Handlers ────────────────────────────────────

  toggleEnabled.addEventListener("change", async () => {
    const enabled = toggleEnabled.checked;
    await saveSetting("enabled", enabled);

    // Notify active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: "toggleTranslation",
        enabled: enabled
      }).catch(() => {});
    }
  });

  apiSchema.addEventListener("change", async () => {
    await saveSetting("apiSchema", apiSchema.value);
    updateHostPlaceholder();
  });

  apiHost.addEventListener("change", () => saveSetting("apiHost", apiHost.value.trim()));
  apiModel.addEventListener("change", () => saveSetting("model", apiModel.value.trim()));
  translateFrom.addEventListener("change", () => saveSetting("translateFrom", translateFrom.value));
  translateTo.addEventListener("change", () => saveSetting("translateTo", translateTo.value));
  fontFamily.addEventListener("change", () => saveSetting("defaultFont", fontFamily.value));
  
  minImageWidth.addEventListener("change", () => saveSetting("minImageWidth", parseInt(minImageWidth.value, 10) || 0));
  minImageHeight.addEventListener("change", () => saveSetting("minImageHeight", parseInt(minImageHeight.value, 10) || 0));

  fontSizeSlider.addEventListener("input", () => {
    fontSizeValue.textContent = fontSizeSlider.value + "px";
  });
  fontSizeSlider.addEventListener("change", () => {
    saveSetting("defaultFontSize", fontSizeSlider.value + "px");
  });

  // ── Test Connection ───────────────────────────────────────

  btnTestConn.addEventListener("click", async () => {
    btnTestConn.disabled = true;
    btnTestConn.classList.add("loading");
    btnTestConn.innerHTML = '<span class="btn-icon">⟳</span> Testing...';

    statusDot.className = "status-dot checking";
    statusText.textContent = "Checking...";

    try {
      const result = await chrome.runtime.sendMessage({ action: "testConnection" });

      if (result.success) {
        statusDot.className = "status-dot connected";
        statusText.textContent = "Connected";
        const modelCount = result.models?.length || 0;
        btnTestConn.innerHTML = `<span class="btn-icon">✓</span> ${modelCount} model(s) found`;
      } else {
        statusDot.className = "status-dot disconnected";
        statusText.textContent = "Disconnected";
        btnTestConn.innerHTML = '<span class="btn-icon">✗</span> Failed';
      }
    } catch (err) {
      statusDot.className = "status-dot disconnected";
      statusText.textContent = "Error";
      btnTestConn.innerHTML = '<span class="btn-icon">✗</span> Error';
    }

    setTimeout(() => {
      btnTestConn.disabled = false;
      btnTestConn.classList.remove("loading");
      btnTestConn.innerHTML = '<span class="btn-icon">⚡</span> Test Connection';
    }, 2000);
  });

  // ── Translate Page ────────────────────────────────────────

  btnTranslatePage.addEventListener("click", async () => {
    btnTranslatePage.disabled = true;
    btnTranslatePage.classList.add("loading");
    btnTranslatePage.innerHTML = '<span class="btn-icon">⟳</span> Translating...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, { action: "translatePage" });
      }
    } catch (err) {
      console.error("Failed to send translate message:", err);
    }

    setTimeout(() => {
      btnTranslatePage.disabled = false;
      btnTranslatePage.classList.remove("loading");
      btnTranslatePage.innerHTML = '<span class="btn-icon">🔄</span> Translate Page';
    }, 2000);
  });

  // ── Error Log ─────────────────────────────────────────────

  async function loadErrorLog() {
    try {
      const result = await chrome.runtime.sendMessage({ action: "getErrorLog" });
      const logs = result?.errorLog || [];

      if (logs.length === 0) {
        errorLogEl.innerHTML = '<div class="error-log-empty">No errors logged</div>';
        return;
      }

      errorLogEl.innerHTML = logs.map(entry => `
        <div class="error-entry">
          <span class="error-timestamp">${formatTimestamp(entry.timestamp)}</span>
          <span class="error-message">${escapeHtml(entry.message)}</span>
        </div>
      `).join("");
    } catch (err) {
      errorLogEl.innerHTML = '<div class="error-log-empty">Unable to load logs</div>';
    }
  }

  btnClearLog.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ action: "clearErrorLog" });
    errorLogEl.innerHTML = '<div class="error-log-empty">No errors logged</div>';
  });

  if (btnDebugModal) {
    if (!CONFIG.DEBUG_MODE) {
      btnDebugModal.style.display = 'none';
    } else {
      btnDebugModal.addEventListener("click", async () => {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id) {
            await chrome.tabs.sendMessage(tab.id, { action: "openDebugModal" });
          }
        } catch (err) {
          console.error("Failed to open debug modal:", err);
        }
      });
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  function formatTimestamp(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return iso;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function updateHostPlaceholder() {
    if (apiSchema.value === "lmstudio") {
      apiHost.placeholder = "http://127.0.0.1:1234/api/v1";
    } else {
      apiHost.placeholder = "http://127.0.0.1:1234/v1";
    }
  }

  // ── Initialize ─────────────────────────────────────────────

  await loadSettings();
  await loadErrorLog();

  // Auto-test connection on open
  btnTestConn.click();
});
