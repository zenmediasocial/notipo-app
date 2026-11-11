import { buildAiImagePrompt } from "../ai-image-prompt.js";
import { fetchRemoteImage } from "./http.js";
import type { ImageProvider, ImageProviderFactoryConfig } from "./types.js";

interface MuapiImageResponse {
  data?: Array<{
    url?: string;
    b64_json?: string;
  }>;
}

export class MuapiImageProvider implements ImageProvider {
  constructor(private readonly config: ImageProviderFactoryConfig) {}

  async generate(input: Parameters<ImageProvider["generate"]>[0]): Promise<Buffer> {
    const prompt = buildAiImagePrompt(input);
    const baseUrl = this.config.baseUrl ?? "https://api.muapi.ai/v1";
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        prompt,
        n: 1,
        size: "1792x1024",
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      throw new Error(`MUAPI image API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as MuapiImageResponse;
    const image = data.data?.[0];
    if (image?.b64_json) return Buffer.from(image.b64_json, "base64");
    if (image?.url) return fetchRemoteImage(image.url);
    throw new Error("MUAPI returned no image data");
  }
}
