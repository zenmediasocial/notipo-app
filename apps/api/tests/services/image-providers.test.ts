import { afterEach, describe, expect, it, vi } from "vitest";
import { createImageProvider } from "../../src/services/image-providers/index.js";

const input = {
  title: "Shipping Notion to Grav",
  category: "Static CMS",
  tags: ["Notion", "Grav"],
  style: "cyberpunk",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createImageProvider", () => {
  it("keeps Gemini available through the shared ImageProvider interface", async () => {
    const imageBytes = Buffer.from("gemini-image");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      candidates: [{
        content: {
          parts: [{ inlineData: { mimeType: "image/png", data: imageBytes.toString("base64") } }],
        },
      }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createImageProvider({
      provider: "GEMINI",
      model: "gemini-2.5-flash-image",
      apiKey: "gemini-key",
    });
    const result = await provider.generate(input);

    expect(result.equals(imageBytes)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("gemini-2.5-flash-image:generateContent");
    expect(String(init.body)).toContain("Shipping Notion to Grav");
    expect(String(init.body)).toContain("cyberpunk");
  });

  it("creates an OpenRouter provider that posts to /images and decodes base64 output", async () => {
    const imageBytes = Buffer.from("openrouter-image");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{ b64_json: imageBytes.toString("base64"), media_type: "image/png" }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createImageProvider({
      provider: "OPENROUTER",
      model: "bytedance-seed/seedream-4.5",
      apiKey: "openrouter-key",
    });
    const result = await provider.generate(input);

    expect(result.equals(imageBytes)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/images");
    expect(init.headers).toMatchObject({ Authorization: "Bearer openrouter-key" });
    expect(String(init.body)).toContain("bytedance-seed/seedream-4.5");
    expect(String(init.body)).toContain("Shipping Notion to Grav");
  });

  it("creates a Fal provider that reads the generated image URL and downloads it", async () => {
    const imageBytes = Buffer.from("fal-image");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ images: [{ url: "https://v3.fal.media/files/test.png" }] }))
      .mockResolvedValueOnce(new Response(imageBytes, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createImageProvider({
      provider: "FAL",
      model: "fal-ai/flux/schnell",
      apiKey: "fal-key",
    });
    const result = await provider.generate(input);

    expect(result.equals(imageBytes)).toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://fal.run/fal-ai/flux/schnell");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://v3.fal.media/files/test.png");
  });

  it("creates a MUAPI provider through the OpenAI-compatible image endpoint", async () => {
    const imageBytes = Buffer.from("muapi-image");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ url: "https://cdn.muapi.ai/test.png" }] }))
      .mockResolvedValueOnce(new Response(imageBytes, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createImageProvider({
      provider: "MUAPI",
      model: "flux-schnell",
      apiKey: "muapi-key",
    });
    const result = await provider.generate(input);

    expect(result.equals(imageBytes)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.muapi.ai/v1/images/generations");
    expect(init.headers).toMatchObject({ Authorization: "Bearer muapi-key" });
    expect(String(init.body)).toContain("flux-schnell");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://cdn.muapi.ai/test.png");
  });

  it("fails fast for an unknown provider", () => {
    expect(() => createImageProvider({
      provider: "UNKNOWN" as never,
      model: "model",
      apiKey: "key",
    })).toThrow("Unsupported AI image provider");
  });
});
