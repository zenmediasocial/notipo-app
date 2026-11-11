import { afterEach, describe, expect, it, vi } from "vitest";
import { GiphyStockImageProvider } from "../../src/services/stock-image-providers/giphy.js";
import { PixabayStockImageProvider } from "../../src/services/stock-image-providers/pixabay.js";
import { PexelsStockImageProvider } from "../../src/services/stock-image-providers/pexels.js";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("stock image providers", () => {
  it("maps Pixabay search hits into downloadable candidates with attribution", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      hits: [{
        largeImageURL: "https://pixabay.com/get/large.jpg",
        webformatURL: "https://pixabay.com/get/web.jpg",
        user: "Pixabay Author",
        pageURL: "https://pixabay.com/photos/test-123/",
      }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new PixabayStockImageProvider("pixabay-key");
    const results = await provider.search("automation");

    expect(fetchMock.mock.calls[0]?.[0]).toContain("https://pixabay.com/api/");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("key=pixabay-key");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("q=automation");
    expect(results[0]).toEqual({
      url: "https://pixabay.com/get/large.jpg",
      attribution: {
        provider: "Pixabay",
        authorName: "Pixabay Author",
        authorUrl: null,
        sourceUrl: "https://pixabay.com/photos/test-123/",
      },
    });
  });

  it("maps Pexels photos into landscape candidates with photographer attribution", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      photos: [{
        url: "https://www.pexels.com/photo/test-123/",
        photographer: "Pexels Author",
        photographer_url: "https://www.pexels.com/@author",
        src: {
          landscape: "https://images.pexels.com/photos/123/landscape.jpeg",
          large: "https://images.pexels.com/photos/123/large.jpeg",
        },
      }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new PexelsStockImageProvider("pexels-key");
    const results = await provider.search("automation");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://api.pexels.com/v1/search?");
    expect(url).toContain("query=automation");
    expect(url).toContain("orientation=landscape");
    expect(init.headers).toMatchObject({ Authorization: "pexels-key" });
    expect(results[0]).toEqual({
      url: "https://images.pexels.com/photos/123/landscape.jpeg",
      attribution: {
        provider: "Pexels",
        authorName: "Pexels Author",
        authorUrl: "https://www.pexels.com/@author",
        sourceUrl: "https://www.pexels.com/photo/test-123/",
      },
    });
  });

  it("maps Giphy results to a still image candidate with source attribution", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{
        url: "https://giphy.com/gifs/test-123",
        username: "giphy-author",
        user: { display_name: "GIPHY Author", profile_url: "https://giphy.com/giphy-author" },
        images: {
          original_still: { url: "https://media.giphy.com/media/test/giphy_s.gif" },
          original: { url: "https://media.giphy.com/media/test/giphy.gif" },
        },
      }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GiphyStockImageProvider("giphy-key");
    const results = await provider.search("automation");

    expect(fetchMock.mock.calls[0]?.[0]).toContain("https://api.giphy.com/v1/gifs/search?");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("api_key=giphy-key");
    expect(results[0]).toEqual({
      url: "https://media.giphy.com/media/test/giphy_s.gif",
      attribution: {
        provider: "GIPHY",
        authorName: "GIPHY Author",
        authorUrl: "https://giphy.com/giphy-author",
        sourceUrl: "https://giphy.com/gifs/test-123",
      },
    });
  });

  it("orders configured stock providers by STOCK_IMAGE_PROVIDER and then falls back", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://notipo:notipo@localhost:5432/notipo");
    vi.stubEnv("ENCRYPTION_KEY", "a".repeat(64));
    vi.stubEnv("API_KEY", "test-admin-key");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "unsplash-key");
    vi.stubEnv("PIXABAY_API_KEY", "pixabay-key");
    vi.stubEnv("PEXELS_API_KEY", "pexels-key");
    vi.stubEnv("GIPHY_API_KEY", "giphy-key");
    vi.stubEnv("STOCK_IMAGE_PROVIDER", "pexels");

    const { getConfiguredStockImageProviders } = await import("../../src/services/stock-image-providers/index.js");
    expect(getConfiguredStockImageProviders().map((provider) => provider.name)).toEqual([
      "pexels",
      "unsplash",
      "pixabay",
      "giphy",
    ]);
  });

  it("searchStockImage falls back to the next configured provider and returns the first usable candidate", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://notipo:notipo@localhost:5432/notipo");
    vi.stubEnv("ENCRYPTION_KEY", "a".repeat(64));
    vi.stubEnv("API_KEY", "test-admin-key");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PIXABAY_API_KEY", "pixabay-key");
    vi.stubEnv("PEXELS_API_KEY", "pexels-key");
    vi.stubEnv("STOCK_IMAGE_PROVIDER", "pixabay");

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ hits: [] }))
      .mockResolvedValueOnce(jsonResponse({
        photos: [{
          url: "https://www.pexels.com/photo/fallback-123/",
          photographer: "Fallback Author",
          photographer_url: "https://www.pexels.com/@fallback",
          src: { landscape: "https://images.pexels.com/photos/123/landscape.jpeg" },
        }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const { searchStockImage } = await import("../../src/services/stock-image-providers/index.js");
    const result = await searchStockImage("automation");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("https://pixabay.com/api/");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("https://api.pexels.com/v1/search?");
    expect(result?.url).toBe("https://images.pexels.com/photos/123/landscape.jpeg");
    expect(result?.attribution.provider).toBe("Pexels");
  });
});
