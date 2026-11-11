import type { AiImageProviderConfig } from "../../lib/ai-image-provider.js";
import type { AiImagePromptInput } from "../ai-image-prompt.js";

/** One AI image backend. Implementations return raw image bytes; the caller crops/normalizes. */
export interface ImageProvider {
  generate(input: AiImagePromptInput): Promise<Buffer>;
}

export type ImageProviderFactoryConfig = AiImageProviderConfig;
