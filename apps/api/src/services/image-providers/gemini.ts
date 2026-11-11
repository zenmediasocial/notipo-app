import { buildAiImagePrompt } from "../ai-image-prompt.js";
import type { ImageProvider, ImageProviderFactoryConfig } from "./types.js";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string;
        };
      }>;
    };
  }>;
}

export class GeminiImageProvider implements ImageProvider {
  constructor(private readonly config: ImageProviderFactoryConfig) {}

  async generate(input: Parameters<ImageProvider["generate"]>[0]): Promise<Buffer> {
    const prompt = buildAiImagePrompt(input);
    const baseUrl = this.config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
    const response = await fetch(`${baseUrl}/models/${this.config.model}:generateContent?key=${this.config.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { aspectRatio: "16:9" },
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      throw new Error(`Gemini API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as GeminiResponse;
    const imagePart = data.candidates?.[0]?.content?.parts?.find(
      (part) => part.inlineData?.mimeType?.startsWith("image/"),
    );
    if (!imagePart?.inlineData) {
      throw new Error("Gemini returned no image data");
    }
    return Buffer.from(imagePart.inlineData.data, "base64");
  }
}
