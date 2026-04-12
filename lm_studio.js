function buildLmStudioRequest(imageBase64, settings, systemPrompt) {
  return {
    model: settings.model,
    input: [
      {
        type: "text",
        content: `Translate all text in this manga image from ${getLangLabel(settings.translateFrom)} to ${getLangLabel(settings.translateTo)}. Return the JSON response.`
      },
      {
        type: "image",
        data_url: imageBase64
      }
    ],
    system_prompt: systemPrompt,
    temperature: 0.1,
    max_output_tokens: 4096,
  };
}
