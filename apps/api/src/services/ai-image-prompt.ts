/**
 * Shared prompt construction for AI-generated featured images.
 * Provider adapters should all receive the same prompt and style vocabulary.
 */

export interface AiImagePromptInput {
  title: string;
  category: string;
  style: string;
  tags?: string[];
}

export const AI_IMAGE_STYLE_GUIDANCE: Record<string, string> = {
  "comic book": "Bold ink outlines, vibrant flat colors, dynamic action poses, halftone dot shading, dramatic angles like a graphic novel splash page.",
  watercolor: "Soft translucent washes, visible brush strokes, bleeding edges, dreamy organic feel with rich pigment pools.",
  "3d render": "Clean glossy surfaces, volumetric lighting, soft shadows, Pixar/Blender aesthetic with depth of field.",
  photorealistic: "Looks like a real photograph — natural lighting, shallow depth of field, realistic materials and textures, cinematic color grading.",
  cyberpunk: "Neon-soaked dark cityscape aesthetic, glowing purple/cyan/magenta, rain-slicked surfaces, holographic displays, dystopian tech noir.",
  retro: "Vintage 80s/90s aesthetic, synthwave colors, CRT scan lines, pixel art influences, nostalgic warm tones.",
};

export function buildAiImagePrompt(params: AiImagePromptInput): string {
  const tagContext = params.tags?.length
    ? `\nRelated topics: ${params.tags.join(", ")}.`
    : "";

  const styleGuide = AI_IMAGE_STYLE_GUIDANCE[params.style.toLowerCase()] || "";

  return [
    `Generate a wide 16:9 landscape blog featured image.`,
    ``,
    `Post title: "${params.title}"`,
    `Category: ${params.category}${tagContext}`,
    ``,
    `Style: ${params.style}`,
    styleGuide ? `Style details: ${styleGuide}` : "",
    ``,
    `INSTRUCTIONS:`,
    `First, analyze the post title and tags to identify the specific tools, platforms, and technologies the post is about.`,
    ``,
    `Then create a scene that ILLUSTRATES what the post is about by including:`,
    `- Recognizable visual representations of the actual tools and platforms mentioned (e.g. their logos, icons, or UI screens)`,
    `- A central character, mascot, or focal element that ties the scene together`,
    `- Visual storytelling that shows the WORKFLOW or CONCEPT — how the tools connect or interact`,
    ``,
    `The image should look like a custom illustration made specifically for this post, not a generic stock image that could be used for any tech article.`,
    ``,
    `- Use dramatic lighting and cinematic composition.`,
    `- Make it visually striking and bold — the kind of image that stops you mid-scroll.`,
    `- Do NOT include any readable text, titles, words, or watermarks in the image. Logos and icons are OK.`,
    `- AVOID: generic abstract backgrounds, boring gradients, bland corporate art, vague "tech" imagery.`,
  ].join("\n");
}
