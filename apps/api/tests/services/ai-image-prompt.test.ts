import { describe, expect, it } from "vitest";
import {
  AI_IMAGE_STYLE_GUIDANCE,
  buildAiImagePrompt,
} from "../../src/services/ai-image-prompt.js";

describe("buildAiImagePrompt", () => {
  it("builds a shared featured-image prompt from title, category, tags, and style", () => {
    const prompt = buildAiImagePrompt({
      title: "Shipping Notion to Grav",
      category: "Static CMS",
      tags: ["Notion", "Grav", "Markdown"],
      style: "Cyberpunk",
    });

    expect(prompt).toContain("Post title: \"Shipping Notion to Grav\"");
    expect(prompt).toContain("Category: Static CMS");
    expect(prompt).toContain("Related topics: Notion, Grav, Markdown.");
    expect(prompt).toContain("Style: Cyberpunk");
    expect(prompt).toContain(AI_IMAGE_STYLE_GUIDANCE["cyberpunk"]);
    expect(prompt).toContain("Do NOT include any readable text");
  });

  it("keeps the existing style presets available to every provider", () => {
    expect(Object.keys(AI_IMAGE_STYLE_GUIDANCE)).toEqual([
      "comic book",
      "watercolor",
      "3d render",
      "photorealistic",
      "cyberpunk",
      "retro",
    ]);
  });
});
