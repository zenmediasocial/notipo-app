import { buildAiImagePrompt } from "../ai-image-prompt.js";
import { fetchRemoteImage } from "./http.js";
import type { ImageProvider, ImageProviderFactoryConfig } from "./types.js";

interface OpenRouterImageResponse {
  data?: Array<{
    b64_json?: string;
    url?: string;
    media_type?: string;
  }>;
}

export class OpenRouterImageProvider implements ImageProvider {
  constructor(private readonly config: ImageProviderFactoryConfig) {}

  async generate(input: Parameters<ImageProvider["generate"]>[0]): Promise<Buffer> {
    const prompt = buildAiImagePrompt(input);
    const baseUrl = this.config.baseUrl ?? "https://openrouter.ai/api/v1";
    const response = await fetch(`${baseUrl}/images`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        prompt,
        aspect_ratio: "16:9",
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      throw new Error(`OpenRouter image API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as OpenRouterImageResponse;
    const image = data.data?.[0];
    if (image?.b64_json) return Buffer.from(image.b64_json, "base64");
    if (image?.url) return fetchRemoteImage(image.url);
    throw new Error("OpenRouter returned no image data");
  }
}
