function buildOpenApiRequest(imageBase64, settings, systemPrompt) {
  return {
    model: settings.model,
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: imageBase64
            }
          },
          {
            type: "text",
            text: `Translate all text in this manga image from ${getLangLabel(settings.translateFrom)} to ${getLangLabel(settings.translateTo)}. Return the JSON response.`
          }
        ]
      }
    ],
    temperature: 0.8,
    top_p: 0.95,
    top_k: 40,
    min_p: 0.05,
    repeat_penalty: 1.1,
    max_tokens: 4096,
    response_format: { 
      type: "json_schema",
      json_schema: {
        name: "manga_translation_regions",
        strict: true,
        schema: {
          type: "object",
          properties: {
            regions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  box_xmin_1000: { type: "number" },
                  box_ymin_1000: { type: "number" },
                  box_xmax_1000: { type: "number" },
                  box_ymax_1000: { type: "number" },
                  fromLang: {
                    type: "object",
                    properties: {
                      code: { type: "string" },
                      text: { type: "string" }
                    },
                    required: ["code", "text"],
                    additionalProperties: false
                  },
                  toLang: {
                    type: "object",
                    properties: {
                      code: { type: "string" },
                      text: { type: "string" }
                    },
                    required: ["code", "text"],
                    additionalProperties: false
                  }
                },
                required: ["box_xmin_1000", "box_ymin_1000", "box_xmax_1000", "box_ymax_1000", "fromLang", "toLang"],
                additionalProperties: false
              }
            }
          },
          required: ["regions"],
          additionalProperties: false
        }
      }
    }
  };
}
