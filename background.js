/**
 * Background Service Worker — API bridge for Local Manga Translator.
 * Handles LLM API communication, connection testing, and error logging.
 */

importScripts("config.js", "openapi.js", "lm_studio.js");

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
    enabled:       stored.enabled !== undefined ? stored.enabled : true
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

  return `You are a manga/comic translation assistant. You receive an image of a manga page or panel.

Your task:
1. Identify ALL text regions in the image (speech bubbles, captions, sound effects, narration boxes, etc.)
2. For each text region, extract the original text and translate it from ${fromLang} to ${toLang}.
3. Estimate the bounding box of each text region using a 1000-point scale (0 to 1000) relative to the full image dimensions, where 0 is the top/left edge and 1000 is the bottom/right edge.

Return ONLY valid JSON with no markdown fences, no commentary, no extra text. Use this exact structure:

{
  "regions": [
    {
      "x_1000": <number, left edge (0-1000)>,
      "y_1000": <number, top edge (0-1000)>,
      "width_1000": <number, region width (0-1000)>,
      "height_1000": <number, region height (0-1000)>,
      "fromLang": {
        "code": "${fromCode}",
        "text": "<original text>"
      },
      "toLang": {
        "code": "${toCode}",
        "text": "<translated text>"
      }
    }
  ]
}

Rules:
- x_1000, y_1000 are the top-left corner coordinates on the 1000-point scale.
- width_1000, height_1000 are the dimensions of the bounding box on the 1000-point scale.
- Preserve special characters, emojis, hearts (♡), and sound effects in translations.
- If the source language is "Auto Detect", identify the language yourself and set fromLang.code accordingly.
- If text is vertical (common in Japanese manga), still provide the bounding box that encompasses all the vertical text.
- If no text is found in the image, return: { "regions": [] }
- Return ONLY the JSON object. No explanation, no markdown.`;
}

// ── API Call ─────────────────────────────────────────────────

async function callLLMApi(imageBase64, settings, retryCount = 0) {
  // Determine the correct endpoint based on the schema
  let endpoint = settings.apiEndpoint;
  
  // If the endpoint is still the default OpenAPI one but we are using LM Studio, auto-switch it.
  if (settings.apiSchema === "lm_studio") {
    endpoint = settings.apiEndpointLmStudio;
  } else if (settings.apiSchema === "openapi") {
    endpoint = settings.apiEndpointOpenApi;
  }

  // Ensure there's a slash between host and endpoint
  const baseUrl = settings.apiHost.endsWith("/") ? settings.apiHost : settings.apiHost + "/";
  const url = `${baseUrl}${endpoint}`;
  const systemPrompt = buildSystemPrompt(settings);

  let body;
  if (settings.apiSchema === "lm_studio") {
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

    if (settings.apiSchema === "lm_studio") {
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

    return { success: true, data: parsed };

  } catch (err) {
    // Retry logic (only for network errors or 5xx server errors, not 4xx client errors)
    const isClientError = err.status >= 400 && err.status < 500;
    
    if (!isClientError && retryCount < CONFIG.MAX_RETRIES) {
      await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY_MS * (retryCount + 1)));
      return callLLMApi(imageBase64, settings, retryCount + 1);
    }

    await logError(err);
    return { success: false, error: err.message };
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
      enabled: true
    });
    console.log("[MangaTL] Extension installed with default settings.");
  }
});
