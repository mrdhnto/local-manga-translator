# Local Manga Translator

Local Manga Translator is an experimental Chrome extension designed to bring seamless, privacy-focused auto-translation to your favorite manga and comics. By leveraging the power of **Local Large Language Models (LLMs)**, you can translate manga panels directly in your browser without sending your data to external cloud services.

> [!WARNING]
> **Status: Under Active Development**
> This project is currently in an experimental phase. While text detection and overlay translation are functional, features like **text painting/inpainting** (removing original text to "clean" the bubbles) are not yet implemented.

---

## 🚀 Features

- **Local & Private**: Connects to your own self-hosted LLM (Ollama, LM Studio, etc.).
- **Dual Schema Support**: Switch between standard **OpenAPI** (OpenAI compatible) and **LM Studio** experimental endpoints.
- **Smart Queueing**: Automatically detects manga-sized images and translates them sequentially, prioritizing the largest panels first.
- **Customizable Aesthetics**: Choose your preferred manga fonts and adjust font sizes for the best reading experience.
- **Hover to Compare**: Hover over any translated region to see the original source text.

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

### Recommended Setup: Ollama / OpenAPI

If you prefer Ollama or a custom OpenAI-compatible proxy:
1. Ensure your server supports the `/v1/chat/completions` endpoint.
2. Select **OpenAPI** in the extension settings.
3. Set the Host URL (e.g., `http://localhost:11434/v1`).

---

## 🧩 Extension Components

- **`background.js`**: The brains of the operation. Handles API communication, connection testing, and schema mapping.
- **`content.js`**: Watches the page for images, identifies manga panels, and renders the translation overlays.
- **`config.js`**: Centralized configuration for default languages, fonts, and API paths.
- **`lm_studio.js` / `openapi.js`**: Schema-specific payload builders to ensure compatibility with different local servers.

---

## 🚧 Roadmap & Limitations

- [ ] **Text Inpainting**: Removing original Japanese text to provide a "scanlation" quality look.
- [ ] **Performance Optimization**: Improving the speed of image base64 conversion and LLM inference.
- [ ] **Expanded Model Support**: Optimized prompts for a wider variety of local Vision models.

---

## 🤝 Contributing

This is a passion project built for the manga and anime community. Whether you're a developer or a reader with a great idea, contributions are highly encouraged!

- Found a bug? Open an issue.
- Have a feature idea? Start a discussion.
- Want to code? Submit a Pull Request.

---

## 📜 Disclaimer

This project is **purely experimental**. It is intended for personal use and to explore the capabilities of local AI in niche tools. Use it at your own risk, and always support the official releases of the manga you read!
