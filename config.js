/**
 * Shared configuration defaults for Local Manga Translator.
 * Acts as the .env equivalent — values are overridable at runtime via chrome.storage.sync.
 */
const CONFIG = {
  // ── API Settings ──────────────────────────────────────────
  API_HOST: "http://127.0.0.1:1234/api/v1",
  API_ENDPOINT_OPENAPI: "chat/completions",
  API_ENDPOINT_LMSTUDIO: "chat",
  API_SCHEMA: "lmstudio", // "openapi" or "lmstudio"
  MODEL: "qwen2.5-vl-7b-instruct",

  // ── Translation Defaults ──────────────────────────────────
  TRANSLATE_FROM: "japanese",
  TRANSLATE_TO: "english",

  // ── Font Defaults ─────────────────────────────────────────
  DEFAULT_FONT: "cc-wild-words",
  DEFAULT_FONT_SIZE: "16px",

  // ── Available Fonts ───────────────────────────────────────
  FONTS: {
    "cc-wild-words": {
      file: "fonts/cc-wild-words/cc-wild-words.ttf",
      family: "CCWildWords"
    },
    "komikah": {
      file: "fonts/komika/KOMIKAH_.ttf",
      family: "Komikah"
    }
  },

  // ── Language Options ──────────────────────────────────────
  LANGUAGES: {
    "auto":       { code: "auto",  label: "Auto Detect" },
    "japanese":   { code: "ja-JP", label: "Japanese" },
    "english":    { code: "en-US", label: "English" },
    "chinese":    { code: "zh-CN", label: "Chinese" },
    "korean":     { code: "ko-KR", label: "Korean" },
    "indonesian": { code: "id-ID", label: "Indonesian" }
  },

  // ── Image Detection Thresholds ────────────────────────────
  MIN_IMAGE_WIDTH: 300,
  MIN_IMAGE_HEIGHT: 300,

  // ── Error Log ─────────────────────────────────────────────
  MAX_ERROR_LOG_ENTRIES: 100,

  // ── API Retry ─────────────────────────────────────────────
  MAX_RETRIES: 1,
  RETRY_DELAY_MS: 2000,

  // ── Overlay Panel ───────────────────────────────────────
  SHOW_OVERLAY_PANEL: true,

  // ── Debug ─────────────────────────────────────────────
  DEBUG_MODE: true,
  DEBUG_LOG: []
};

// Make CONFIG available in both service worker and content script contexts
if (typeof globalThis !== "undefined") {
  globalThis.CONFIG = CONFIG;
}
