# Local Manga Translator

Local Manga Translator is an experimental Chrome extension designed to bring seamless, privacy-focused auto-translation to your favorite manga and comics. By leveraging the power of **Local Large Language Models (LLMs)**, you can translate manga panels directly in your browser without sending your data to external cloud services.

> [!WARNING]
> **Status: Under Active Development**
> This project is currently in an experimental phase. While text detection and overlay translation are functional, features like **text painting/inpainting** (removing original text to "clean" the bubbles) are not yet implemented.

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
- **`overlay-panel.js`**: Implements the interactive on-screen settings cog and quick translation controls.
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
- [ ] **Add OpenAI Online API Support**: Add support for online OpenAI API with your BYOT API Key (e.g. DeepSeek, Grok, Openrouter, etc.)
- [ ] **Add Horde AI Support**: Add support for Horde AI to translate text from images.
- [ ] **Add OCR Support**: Add support for OCR to extract text from images.

---

## 🤝 Contributing

This is a passion project built for the manga and anime community. Whether you're a developer or a reader with a great idea, contributions are highly encouraged!

- Found a bug? Open an issue.
- Have a feature idea? Start a discussion.
- Want to code? Submit a Pull Request.

---

## 📜 Disclaimer

This project is **purely experimental**. It is intended for personal use and to explore the capabilities of local AI in niche tools. Use it at your own risk, and always support the official releases of the manga you read!
