import { afterEach, describe, expect, it, vi } from "vitest";

function stubBaseEnv() {
  vi.stubEnv("DATABASE_URL", "postgresql://notipo:notipo@localhost:5432/notipo");
  vi.stubEnv("ENCRYPTION_KEY", "a".repeat(64));
  vi.stubEnv("API_KEY", "test-admin-key");
  vi.stubEnv("NODE_ENV", "test");
}

async function loadProviderLib() {
  vi.resetModules();
  stubBaseEnv();
  return import("../../src/lib/ai-image-provider.js");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("AI image provider config", () => {
  it("normalizes a legacy encrypted Gemini credential into the provider config shape", async () => {
    const { normalizeAiImageProviderConfig } = await loadProviderLib();

    expect(normalizeAiImageProviderConfig({ apiKey: "legacy-gemini-key" })).toEqual({
      provider: "GEMINI",
      model: "gemini-2.5-flash-image",
      apiKey: "legacy-gemini-key",
      baseUrl: undefined,
    });
  });

  it("resolves an encrypted tenant provider config before environment fallback", async () => {
    const { resolveAiImageProvider } = await loadProviderLib();
    const { encryptJson } = await import("../../src/lib/encryption.js");
    const prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({
          aiImageProvider: encryptJson({
            provider: "OPENROUTER",
            model: "bytedance-seed/seedream-4.5",
            apiKey: "tenant-openrouter-key",
            baseUrl: "https://openrouter.ai/api/v1",
          }),
        }),
      },
    };

    const resolved = await resolveAiImageProvider(prisma as never, "tenant_123");

    expect(resolved).toEqual({
      provider: "OPENROUTER",
      model: "bytedance-seed/seedream-4.5",
      apiKey: "tenant-openrouter-key",
      baseUrl: "https://openrouter.ai/api/v1",
    });
  });

  it("falls back to the configured self-hosted provider only when no tenant config exists", async () => {
    vi.stubEnv("AI_IMAGE_PROVIDER", "OPENROUTER");
    vi.stubEnv("OPENROUTER_API_KEY", "instance-openrouter-key");
    vi.stubEnv("OPENROUTER_IMAGE_MODEL", "bytedance-seed/seedream-4.5");
    const { resolveAiImageProvider } = await loadProviderLib();
    const prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ aiImageProvider: null }),
      },
    };

    const resolved = await resolveAiImageProvider(prisma as never, "tenant_123");

    expect(resolved).toEqual({
      provider: "OPENROUTER",
      model: "bytedance-seed/seedream-4.5",
      apiKey: "instance-openrouter-key",
      baseUrl: "https://openrouter.ai/api/v1",
    });
  });

  it("detects a self-hosted provider from an available env key when AI_IMAGE_PROVIDER is unset", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "instance-openrouter-key");
    const { resolveAiImageProvider } = await loadProviderLib();
    const prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ aiImageProvider: null }),
      },
    };

    const resolved = await resolveAiImageProvider(prisma as never, "tenant_123");

    expect(resolved).toEqual({
      provider: "OPENROUTER",
      model: "google/gemini-2.5-flash-image",
      apiKey: "instance-openrouter-key",
      baseUrl: "https://openrouter.ai/api/v1",
    });
  });
});
