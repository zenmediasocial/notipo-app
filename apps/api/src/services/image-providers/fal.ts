import { buildAiImagePrompt } from "../ai-image-prompt.js";
import { fetchRemoteImage } from "./http.js";
import type { ImageProvider, ImageProviderFactoryConfig } from "./types.js";

interface FalImageResponse {
  images?: Array<{ url?: string }>;
}

export class FalImageProvider implements ImageProvider {
  constructor(private readonly config: ImageProviderFactoryConfig) {}

  async generate(input: Parameters<ImageProvider["generate"]>[0]): Promise<Buffer> {
    const prompt = buildAiImagePrompt(input);
    const baseUrl = this.config.baseUrl ?? "https://fal.run";
    const response = await fetch(`${baseUrl}/${this.config.model}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        image_size: "landscape_16_9",
        num_images: 1,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      throw new Error(`Fal image API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as FalImageResponse;
    const url = data.images?.[0]?.url;
    if (!url) throw new Error("Fal returned no image URL");
    return fetchRemoteImage(url);
  }
}
