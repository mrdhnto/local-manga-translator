# Local Manga Translator

> [!IMPORTANT]
> **⚠️ This Repository is Archived**
>
> This proof-of-concept repository is **no longer actively maintained**. Development has moved to **[Libre Manga Translator (LMT)](https://github.com/mrdhnto/libre-manga-translator)**, a complete rewrite built on the [ComicTL](https://github.com/kiuyha/ComicTL) foundation with every concept from this PoC integrated and significantly expanded:
>
> - ✅ **Three translation modes**: Local WebGPU (Qwen3 via WebLLM), Cloud (Gemini API), and Self-Hosted (Ollama / LM Studio / any OpenAI-compatible endpoint - the original purpose of this repo)
> - ✅ **Advanced bubble detection**: Custom YOLO26 ONNX model with an interactive drag/resize/undo editor
> - ✅ **On-device OCR**: PaddleOCR ONNX with full coordinate mapping - no more VLM image payloads needed
> - ✅ **Dual schema support**: OpenAI-compatible and LM Studio experimental endpoints (ported directly from this codebase)
> - ✅ **Production-ready architecture**: WXT + Svelte 5 + TypeScript, MV3 service worker hardening, offscreen inference thread, series context and site adapters
> - ✅ **Chrome and Firefox** support with signed release planned
>
> **👉 [Visit the successor repository](https://github.com/mrdhnto/libre-manga-translator) for the actively maintained version.**
> **📦 [Download the latest release](https://github.com/mrdhnto/libre-manga-translator/releases)**

---

Local Manga Translator is an experimental Chrome extension designed to bring seamless, privacy-focused auto-translation to your favorite manga and comics. By leveraging the power of **Local Large Language Models (LLMs)**, you can translate manga panels directly in your browser without sending your data to external cloud services.

> [!WARNING]
> **Status: Proof-of-Concept (Archived)**
> This experimental phase is complete. The concepts explored here - self-hosted LLM integration, dual schema support, and debug logging - have been ported and improved in [Libre Manga Translator](https://github.com/mrdhnto/libre-manga-translator). This codebase remains for historical reference only and receives no further updates.

---

## 🚀 Features

- **Local & Private**: Connects to your own self-hosted LLM (Ollama, LM Studio, etc.).
- **Dual Schema Support**: Switch between standard **OpenAI** (OpenAI compatible) and **LM Studio** experimental endpoints.
- **Smart Queueing**: Automatically detects manga-sized images and translates them sequentially, prioritizing the largest panels first.
- **Smart Region Post-Processing**: Intelligently merges fragmented text fragments, fixes inverted coordinates, and deduplicates overlap to ensure clean speech bubble overlays.
- **Responsive Layout**: Overlays automatically re-calculate and re-position on window resize, maintaining accuracy across all screen sizes.
- **On-Screen Control**: A subtle settings cog injected onto webpages for quick translation toggles and quick access to extension features.
- **Customizable Aesthetics**: Choose your preferred manga fonts and adjust font sizes for the best reading experience.
- **Hover to Compare**: Hover over any translated region to see the original source text.
- **Configurable Image Filtering**: Set minimum width and height thresholds directly from the popup to exclude small UI elements from translation.
- **Advanced Debugging**: Robust debug modal with JSON export, clipboard copying, and detailed metadata tracking for every API request.

---

## 🛠️ Getting Started (Local LLM Usage)

To use this extension, you need a local LLM server capable of handling **Vision-Language Models (VLM)** like `qwen2.5-vl`.

### Recommended Setup: LM Studio

1. **Download LM Studio**: Install [LM Studio](https://lmstudio.ai/).
2. **Download a Vision Model**: Search for and download a model like `qwen2.5-vl-7b-instruct`.
3. **Start the Local Server**:
   - Go to the **Local Server** tab.
   - Select your Vision model.
   - Click **Start Server**.
   - Note your endpoint (usually `http://127.0.0.1:1234`).
4. **Configure Extension**:
   - Open the extension popup.
   - Select **LM Studio (Experimental)** as the API Schema.
   - Set the Host URL to `http://127.0.0.1:1234/api/v1`.
   - Ensure the Model name matches what you loaded in LM Studio.

### Recommended Setup: Ollama / OpenAI

If you prefer Ollama or a custom OpenAI-compatible proxy:
1. Ensure your server supports the `/v1/chat/completions` endpoint.
2. Select **OpenAI** in the extension settings.
3. Set the Host URL (e.g., `http://localhost:11434/v1`).

---

## 🧩 Extension Components

- **`background.js`**: The brains of the operation. Handles API communication, connection testing, and schema mapping.
- **`content.js`**: Watches the page for images, identifies manga panels, and manages the translation rendering lifecycle.
- **`region-processor.js`**: A deep-processing pipeline that validates LLM output, merges fragmented character boxes, and fixes coordinate hallucinations.
- **`config.js`**: Centralized configuration for default languages, fonts, and system-wide thresholds.
- **`debug.js`**: Dedicated script for the robust debug modal, handling session logging and JSON export independently from core logic.
- **`overlay-panel.js`**: Implements the interactive on-screen settings cog and quick translation controls. Also the place for more Advanced Settings to not clutter the popup.
- **`popup.js` & `popup.html`**: The main interface for configuring API endpoints, language pairs, and visual preferences.
- **`lmstudio.js` / `openai.js`**: Schema-specific payload builders and response parsers for different local LLM backends.

---

## 🧪 Test Images

You can use the following sample images to test the extension's text detection and translation features directly in your browser:

- [English Text Sample](https://i.sstatic.net/YjY3d.jpg)
- [Japanese Text Sample](https://i.sstatic.net/eLMHJ.jpg)

---

## 🚧 Roadmap & Limitations

- [ ] **Text Inpainting**: Removing original Japanese text to provide a "scanlation" quality look.
- [x] **Performance Optimization**: Implemented JPEG conversion and intelligent downscaling (2048px) to minimize payload size and inference time.
- [ ] **Expanded Model Support**: Optimized prompts for a wider variety of local Vision models.
- [x] **Add OpenAI Online API Support**: Add support for online OpenAI Compatible API with your BYOT API Key (e.g. DeepSeek, Grok, Openrouter, etc.)
- [ ] **Add Horde AI Support**: Add support for Horde AI to translate text from images.
- [ ] **Add OCR Support**: Add support for OCR to extract text from images.

---

## 🤝 Contributing

This repository is archived and no longer accepts pull requests or issues.

If you want to contribute to active development, head to **[Libre Manga Translator](https://github.com/mrdhnto/libre-manga-translator)** - the successor project. The easiest way to start is a site adapter PR, which takes about three minutes and helps everyone who reads on that site.

---

## 📜 Disclaimer

This project is **purely experimental** and was intended as a proof-of-concept for local AI in browser extensions. It is archived and no longer maintained.

For a production-ready version with all features from this PoC and more, use **[Libre Manga Translator](https://github.com/mrdhnto/libre-manga-translator)**. Always support the official releases of the manga you read.
