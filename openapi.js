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
    temperature: 0.1,
    max_tokens: 4096,
    response_format: { type: "json_schema" }
  };
}
