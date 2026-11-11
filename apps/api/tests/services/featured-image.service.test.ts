import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

function stubBaseEnv() {
  vi.stubEnv("DATABASE_URL", "postgresql://notipo:notipo@localhost:5432/notipo");
  vi.stubEnv("ENCRYPTION_KEY", "a".repeat(64));
  vi.stubEnv("API_KEY", "test-admin-key");
  vi.stubEnv("NODE_ENV", "test");
}

const createImageProvider = vi.fn();
const getConfiguredStockImageProviders = vi.fn();
vi.doMock("../../src/services/image-providers/index.js", () => ({
  createImageProvider,
}));
vi.doMock("../../src/services/stock-image-providers/index.js", () => ({
  getConfiguredStockImageProviders,
}));

async function loadService() {
  vi.resetModules();
  stubBaseEnv();
  return import("../../src/services/featured-image.service.js");
}

afterEach(() => {
  createImageProvider.mockReset();
  getConfiguredStockImageProviders.mockReset();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("FeaturedImageService AI provider dispatch", () => {
  it("delegates generation to the configured provider and normalizes the result to 1200x628 PNG", async () => {
    const raw = await sharp({
      create: { width: 300, height: 300, channels: 3, background: "#ff0000" },
    }).png().toBuffer();
    const generate = vi.fn().mockResolvedValue(raw);
    createImageProvider.mockReturnValue({ generate });
    const { FeaturedImageService } = await loadService();

    const result = await new FeaturedImageService().generate({
      title: "Shipping Notion to Grav",
      category: "Static CMS",
      tags: ["Notion", "Grav"],
      mode: "AI_GENERATED",
      aiImageStyle: "cyberpunk",
      aiImageProvider: {
        provider: "OPENROUTER",
        model: "bytedance-seed/seedream-4.5",
        apiKey: "openrouter-key",
      },
    });

    expect(createImageProvider).toHaveBeenCalledWith({
      provider: "OPENROUTER",
      model: "bytedance-seed/seedream-4.5",
      apiKey: "openrouter-key",
    });
    expect(generate).toHaveBeenCalledWith({
      title: "Shipping Notion to Grav",
      category: "Static CMS",
      tags: ["Notion", "Grav"],
      style: "cyberpunk",
    });

    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(628);
    expect(metadata.format).toBe("png");
  });

  it("falls back across configured stock providers and returns generic attribution", async () => {
    const raw = await sharp({
      create: { width: 400, height: 300, channels: 3, background: "#00ff00" },
    }).png().toBuffer();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(raw, { status: 200 })));

    const failingProvider = {
      name: "unsplash",
      search: vi.fn().mockRejectedValue(new Error("rate limited")),
      trackDownload: vi.fn(),
    };
    const fallbackProvider = {
      name: "pexels",
      search: vi.fn().mockResolvedValue([{
        url: "https://images.example/background.png",
        attribution: {
          provider: "Pexels",
          authorName: "Fallback Author",
          authorUrl: "https://www.pexels.com/@fallback",
          sourceUrl: "https://www.pexels.com/photo/fallback/",
        },
      }]),
      trackDownload: vi.fn(),
    };
    getConfiguredStockImageProviders.mockReturnValue([failingProvider, fallbackProvider]);
    const { FeaturedImageService } = await loadService();

    const result = await new FeaturedImageService().generate({
      title: "Shipping Notion to Grav",
      category: "Static CMS",
    });

    expect(getConfiguredStockImageProviders).toHaveBeenCalled();
    expect(failingProvider.search).toHaveBeenCalledWith("Static CMS");
    expect(fallbackProvider.search).toHaveBeenCalledWith("Static CMS");
    expect(fetch).toHaveBeenCalledWith("https://images.example/background.png", expect.anything());
    expect(result.stockAttribution).toEqual({
      provider: "Pexels",
      authorName: "Fallback Author",
      authorUrl: "https://www.pexels.com/@fallback",
      sourceUrl: "https://www.pexels.com/photo/fallback/",
    });

    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(628);
    expect(metadata.format).toBe("png");
  });
});
