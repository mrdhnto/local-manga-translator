/**
 * Background Service Worker — API bridge for Local Manga Translator.
 * Handles LLM API communication, connection testing, and error logging.
 */

importScripts("config.js", "openapi.js", "lmstudio.js");

// ── Helpers ─────────────────────────────────────────────────

/**
 * Get current settings merged with defaults.
 */
async function getSettings() {
  const stored = await chrome.storage.sync.get(null);
  return {
    apiHost:       stored.apiHost       || CONFIG.API_HOST,
    apiEndpointOpenApi:   stored.apiEndpointOpenApi   || CONFIG.API_ENDPOINT_OPENAPI,
    apiEndpointLmStudio:   stored.apiEndpointLmStudio   || CONFIG.API_ENDPOINT_LMSTUDIO,
    apiSchema:     stored.apiSchema     || CONFIG.API_SCHEMA,
    model:         stored.model         || CONFIG.MODEL,
    translateFrom: stored.translateFrom || CONFIG.TRANSLATE_FROM,
    translateTo:   stored.translateTo   || CONFIG.TRANSLATE_TO,
    defaultFont:   stored.defaultFont   || CONFIG.DEFAULT_FONT,
    defaultFontSize: stored.defaultFontSize || CONFIG.DEFAULT_FONT_SIZE,
    enabled:       stored.enabled !== undefined ? stored.enabled : true,
    showOverlayPanel: stored.showOverlayPanel !== undefined ? stored.showOverlayPanel : CONFIG.SHOW_OVERLAY_PANEL,
    debugMode:     stored.debugMode !== undefined ? stored.debugMode : CONFIG.DEBUG_MODE
  };
}

/**
 * Log an error to chrome.storage.local (capped).
 */
async function logError(error) {
  const errorLog = [{
    timestamp: new Date().toISOString(),
    message: typeof error === "string" ? error : error.message || JSON.stringify(error),
    stack: error.stack || null
  }];
  await chrome.storage.local.set({ errorLog });
}

/**
 * Build the language label from a key (e.g., "japanese" -> "Japanese").
 */
function getLangLabel(key) {
  return CONFIG.LANGUAGES[key]?.label || key;
}

/**
 * Build the language code from a key (e.g., "japanese" -> "ja-JP").
 */
function getLangCode(key) {
  return CONFIG.LANGUAGES[key]?.code || key;
}

// ── System Prompt Builder ───────────────────────────────────

function buildSystemPrompt(settings) {
  const fromLang = getLangLabel(settings.translateFrom);
  const fromCode = getLangCode(settings.translateFrom);
  const toLang = getLangLabel(settings.translateTo);
  const toCode = getLangCode(settings.translateTo);
  const fontName = settings.defaultFont;

  return `You are an expert manga translator fluent in ${fromLang} and ${toLang}, skilled in idiomatic expressions, onomatopoeia, tonal register, and vertical text conventions. You receive a manga page image.

Task: Identify all text regions (speech bubbles, captions, SFX, narration). For each, extract the full original text, translate it, and estimate the bounding box on a 1000-point scale (0-1000).

IMPORTANT: One speech bubble = ONE region. Never split a bubble into individual characters. Group all text within a single bubble (including multi-line or vertical columns) as one region. Aim for 3-15 regions per page.

Return ONLY valid JSON:
{"regions":[{"box_xmin_1000":<left 0-1000>,"box_ymin_1000":<top 0-1000>,"box_xmax_1000":<right 0-1000>,"box_ymax_1000":<bottom 0-1000>,"fromLang":{"code":"${fromCode}","text":"<original>"},"toLang":{"code":"${toCode}","text":"<translated>"}}]}

Rules:
- box_xmin_1000 < box_xmax_1000 and box_ymin_1000 < box_ymax_1000.
- Preserve SFX, emojis, special characters in translations.
- If source is "Auto Detect", identify the language and set fromLang.code.
- If no text found, return {"regions":[]}.
- No markdown, no explanation. JSON only.`;
}

// ── Payload Truncation Helper ───────────────────────────────

function createTruncatedPayload(body) {
  let cleanPayload;
  try {
    cleanPayload = JSON.parse(JSON.stringify(body));
    // For OpenAPI schema
    if (cleanPayload.messages) {
      for (let msg of cleanPayload.messages) {
        if (Array.isArray(msg.content)) {
          for (let part of msg.content) {
            if (part.type === "image_url" && typeof part.image_url?.url === "string" && part.image_url.url.length > 100) {
              part.image_url.url = `[Base64 Image Truncated - length: ${part.image_url.url.length}]`;
            }
          }
        }
      }
    }
    // For LM Studio native schema
    if (cleanPayload.input && Array.isArray(cleanPayload.input)) {
      for (let part of cleanPayload.input) {
        if (part.type === "image" && typeof part.data_url === "string" && part.data_url.length > 100) {
          part.data_url = `[Base64 Image Truncated - length: ${part.data_url.length}]`;
        }
      }
    }
  } catch (e) {
    cleanPayload = { error: "Failed to parse payload for logging" };
  }
  return cleanPayload;
}

// ── API Call ─────────────────────────────────────────────────

async function callLLMApi(imageBase64, settings, retryCount = 0) {
  // Determine the correct endpoint based on the schema
  let endpoint = settings.apiEndpoint;
  
  // If the endpoint is still the default OpenAPI one but we are using LM Studio, auto-switch it.
  if (settings.apiSchema === "lmstudio") {
    endpoint = settings.apiEndpointLmStudio;
  } else if (settings.apiSchema === "openapi") {
    endpoint = settings.apiEndpointOpenApi;
  }

  // Ensure there's a slash between host and endpoint
  const baseUrl = settings.apiHost.endsWith("/") ? settings.apiHost : settings.apiHost + "/";
  const url = `${baseUrl}${endpoint}`;
  const systemPrompt = buildSystemPrompt(settings);

  let body;
  if (settings.apiSchema === "lmstudio") {
    body = buildLmStudioRequest(imageBase64, settings, systemPrompt);
  } else {
    body = buildOpenApiRequest(imageBase64, settings, systemPrompt);
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      const err = new Error(`API ${response.status}: ${errText}`);
      err.status = response.status;
      throw err;
    }

    const data = await response.json();
    let content;

    if (settings.apiSchema === "lmstudio") {
      // Extract from LM Studio's native response format
      content = data.output?.[0]?.content;
    } else {
      // Extract from standard OpenAI/OpenAPI response format
      content = data.choices?.[0]?.message?.content;
    }

    if (!content) {
      throw new Error("Empty response from LLM API");
    }

    // Parse the JSON content — handle potential markdown fences
    let parsed;
    try {
      let cleaned = content.trim();
      // Strip markdown code fences if present
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
      }
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      throw new Error(`Failed to parse LLM JSON: ${parseErr.message}\nRaw: ${content.substring(0, 500)}`);
    }

    const outPayload = createTruncatedPayload(body);
    return { success: true, data: parsed, payload: outPayload, responseData: content };

  } catch (err) {
    // Retry logic (only for network errors or 5xx server errors, not 4xx client errors)
    const isClientError = err.status >= 400 && err.status < 500;
    
    if (!isClientError && retryCount < CONFIG.MAX_RETRIES) {
      await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY_MS * (retryCount + 1)));
      return callLLMApi(imageBase64, settings, retryCount + 1);
    }

    await logError(err);
    const outPayload = createTruncatedPayload(body);
    return { success: false, error: err.message, payload: outPayload, responseData: err.message };
  }
}

// ── Connection Test ──────────────────────────────────────────

async function testConnection(settings) {
  const baseUrl = settings.apiHost.endsWith("/") ? settings.apiHost : settings.apiHost + "/";
  const url = `${baseUrl}models`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return {
      success: true,
      models: data.data?.map(m => m.id) || []
    };
  } catch (err) {
    await logError(`Connection test failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ── Fetch image by URL (CORS fallback) ──────────────────────

async function fetchImageAsBase64(imageUrl) {
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    await logError(`Failed to fetch image: ${err.message}`);
    return null;
  }
}

// ── Message Listener ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    const settings = await getSettings();

    switch (request.action) {
      case "translateImage": {
        let imageData = request.imageBase64;

        // CORS fallback: if content script couldn't convert to base64, fetch here
        if (!imageData && request.imageUrl) {
          imageData = await fetchImageAsBase64(request.imageUrl);
          if (!imageData) {
            sendResponse({ success: false, error: "Failed to fetch image for translation" });
            return;
          }
        }

        const result = await callLLMApi(imageData, settings);
        sendResponse(result);
        break;
      }

      case "testConnection": {
        const result = await testConnection(settings);
        sendResponse(result);
        break;
      }

      case "getSettings": {
        sendResponse(settings);
        break;
      }

      case "getErrorLog": {
        const { errorLog = [] } = await chrome.storage.local.get("errorLog");
        sendResponse({ errorLog });
        break;
      }

      case "clearErrorLog": {
        await chrome.storage.local.set({ errorLog: [] });
        sendResponse({ success: true });
        break;
      }

      default:
        sendResponse({ error: "Unknown action" });
    }
  })();

  // Return true to keep the message channel open for async response
  return true;
});

// ── Extension Install / Update ───────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    // Set initial defaults
    await chrome.storage.sync.set({
      apiHost: CONFIG.API_HOST,
      apiEndpointOpenApi: CONFIG.API_ENDPOINT_OPENAPI,
      apiEndpointLmStudio: CONFIG.API_ENDPOINT_LMSTUDIO,
      apiSchema: CONFIG.API_SCHEMA,
      model: CONFIG.MODEL,
      translateFrom: CONFIG.TRANSLATE_FROM,
      translateTo: CONFIG.TRANSLATE_TO,
      defaultFont: CONFIG.DEFAULT_FONT,
      defaultFontSize: CONFIG.DEFAULT_FONT_SIZE,
      enabled: true,
      showOverlayPanel: CONFIG.SHOW_OVERLAY_PANEL,
      debugMode: CONFIG.DEBUG_MODE
    });
    console.log("[MangaTL] Extension installed with default settings.");
  }
});
