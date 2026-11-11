/**
 * Which AI image provider config a generated featured image is billed to.
 *
 * The rule lives here alone so it cannot drift between the settings route that
 * validates it and the sync job that spends it.
 */

import type { PrismaClient } from "@prisma/client";
import { CredentialService, type AiImageProviderCredentials } from "../services/credential.service.js";
import { isSelfHosted } from "./plan-limits.js";
import { config } from "../config.js";

export const AI_IMAGE_PROVIDERS = ["GEMINI", "OPENROUTER", "FAL", "MUAPI"] as const;
export type AiImageProviderName = (typeof AI_IMAGE_PROVIDERS)[number];

export interface AiImageProviderConfig {
  provider: AiImageProviderName;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export const DEFAULT_AI_IMAGE_MODELS: Record<AiImageProviderName, string> = {
  GEMINI: "gemini-2.5-flash-image",
  OPENROUTER: "google/gemini-2.5-flash-image",
  FAL: "fal-ai/flux/schnell",
  MUAPI: "flux-schnell",
};

export const DEFAULT_AI_IMAGE_BASE_URLS: Record<AiImageProviderName, string | undefined> = {
  GEMINI: "https://generativelanguage.googleapis.com/v1beta",
  OPENROUTER: "https://openrouter.ai/api/v1",
  FAL: "https://fal.run",
  MUAPI: "https://api.muapi.ai/v1",
};

function normalizeProviderName(provider?: string | null): AiImageProviderName | undefined {
  if (!provider) return undefined;
  const normalized = provider.trim().toUpperCase();
  return (AI_IMAGE_PROVIDERS as readonly string[]).includes(normalized)
    ? (normalized as AiImageProviderName)
    : undefined;
}

/**
 * Accepts the current provider config shape and the legacy Gemini-only shape
 * ({ apiKey }) produced before the column was generalized.
 */
export function normalizeAiImageProviderConfig(
  creds: AiImageProviderCredentials,
): AiImageProviderConfig | null {
  if (!creds.apiKey) return null;
  const provider = normalizeProviderName(creds.provider) ?? "GEMINI";
  return {
    provider,
    model: creds.model || DEFAULT_AI_IMAGE_MODELS[provider],
    apiKey: creds.apiKey,
    baseUrl: creds.baseUrl || undefined,
  };
}

function envFallbackFor(provider: AiImageProviderName): AiImageProviderConfig | null {
  const apiKey =
    provider === "GEMINI" ? config.GEMINI_API_KEY
      : provider === "OPENROUTER" ? config.OPENROUTER_API_KEY
        : provider === "FAL" ? config.FAL_KEY
          : config.MUAPI_API_KEY;

  if (!apiKey) return null;

  const model =
    provider === "GEMINI" ? config.GEMINI_IMAGE_MODEL
      : provider === "OPENROUTER" ? config.OPENROUTER_IMAGE_MODEL
        : provider === "FAL" ? config.FAL_IMAGE_MODEL
          : config.MUAPI_IMAGE_MODEL;

  const baseUrl =
    provider === "GEMINI" ? config.GEMINI_BASE_URL
      : provider === "OPENROUTER" ? config.OPENROUTER_BASE_URL
        : provider === "FAL" ? config.FAL_BASE_URL
          : config.MUAPI_BASE_URL;

  return {
    provider,
    model: model || DEFAULT_AI_IMAGE_MODELS[provider],
    apiKey,
    baseUrl: baseUrl || DEFAULT_AI_IMAGE_BASE_URLS[provider],
  };
}

function resolveInstanceAiImageProvider(): AiImageProviderConfig | null {
  const configuredProvider = normalizeProviderName(config.AI_IMAGE_PROVIDER);
  if (configuredProvider) return envFallbackFor(configuredProvider);

  // Backward-compatible default: a self-hosted instance with only the old
  // GEMINI_API_KEY set keeps working. Otherwise pick the first provider with
  // an instance key configured.
  for (const provider of AI_IMAGE_PROVIDERS) {
    const fallback = envFallbackFor(provider);
    if (fallback) return fallback;
  }
  return null;
}

/**
 * The tenant's own provider config if they have set one.
 *
 * Otherwise the instance provider, but only when self-hosted — there the
 * operator and the tenant are the same person. On the hosted service there is
 * deliberately no fallback: generation bills whoever owns the key. Returns
 * null when no provider config applies, and the caller refuses.
 */
export async function resolveAiImageProvider(
  prisma: PrismaClient,
  tenantId: string,
): Promise<AiImageProviderConfig | null> {
  const creds = await new CredentialService(prisma).getAiImageProvider(tenantId);
  const tenantConfig = creds ? normalizeAiImageProviderConfig(creds) : null;
  if (tenantConfig) return tenantConfig;
  if (isSelfHosted()) return resolveInstanceAiImageProvider();
  return null;
}
