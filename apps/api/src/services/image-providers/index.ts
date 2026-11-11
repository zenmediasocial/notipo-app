import { FalImageProvider } from "./fal.js";
import { GeminiImageProvider } from "./gemini.js";
import { MuapiImageProvider } from "./muapi.js";
import { OpenRouterImageProvider } from "./openrouter.js";
import type { ImageProvider, ImageProviderFactoryConfig } from "./types.js";

export function createImageProvider(config: ImageProviderFactoryConfig): ImageProvider {
  switch (config.provider) {
    case "GEMINI":
      return new GeminiImageProvider(config);
    case "OPENROUTER":
      return new OpenRouterImageProvider(config);
    case "FAL":
      return new FalImageProvider(config);
    case "MUAPI":
      return new MuapiImageProvider(config);
    default:
      throw new Error(`Unsupported AI image provider: ${(config as { provider?: string }).provider}`);
  }
}

export type { ImageProvider } from "./types.js";
