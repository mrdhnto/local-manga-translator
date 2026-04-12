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
    temperature: 0.8,
    top_p: 0.95,
    top_k: 40,
    min_p: 0.05,
    repeat_penalty: 1.1,
    max_output_tokens: 4096,
  };
}
