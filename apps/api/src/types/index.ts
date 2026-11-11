import type { CodeHighlighter } from "@prisma/client";
import type { AiImageProviderConfig } from "../lib/ai-image-provider.js";
import type { StockImageAttribution } from "../services/stock-image-providers/types.js";

// Notion block conversion output
export interface NotionConversionResult {
  markdown: string;
  metadata: {
    title: string;
    category: string;
    featuredImageTitle: string;
    notionId: string;
    seoKeyword?: string;
    seoDescription?: string;
    slug?: string;
    tags?: string[];
  };
  images: ImageRef[];
}

export interface ImageRef {
  alt: string;
  url: string;
  fullMatch: string;
}

// Image pipeline
export interface ImageMapping {
  notionImageUrl: string;
  wpImageUrl: string;
  wpMediaId: number;
  filename: string;
}

export interface ProcessedImages {
  urlMap: Record<string, string>;
  mappingIds: string[];
  processedContent: string;
}

// WordPress
export interface WPPostPayload {
  title: string;
  content: string;
  status: "draft" | "publish" | "future";
  slug?: string;
  categories?: number[];
  tags?: number[];
  featured_media?: number;
  date?: string;            // ISO 8601, for scheduling
  excerpt?: string;         // Custom excerpt
  sticky?: boolean;
  comment_status?: "open" | "closed";
  ping_status?: "open" | "closed";
}

export interface WPMediaUpload {
  id: number;
  source_url: string;
  title: { rendered: string };
  alt_text: string;
}

export interface SeoPayload {
  keyword: string;
  title: string;
  description: string;
}

// Featured image generation
export interface FeaturedImageRequest {
  title: string;
  category: string;
  backgroundImageUrl?: string;
  /** When set to AI_GENERATED, uses the configured AI image provider instead of the standard sharp/canvas pipeline. */
  mode?: "STANDARD" | "AI_GENERATED";
  /** Provider config to bill the generation to. Absent means AI mode is unavailable. */
  aiImageProvider?: AiImageProviderConfig;
  /** AI image style (e.g. "comic book", "watercolor"). Only used when mode is AI_GENERATED. */
  aiImageStyle?: string;
  /** Post tags — passed to the AI image provider for context. */
  tags?: string[];
}

export interface FeaturedImageResult {
  buffer: Buffer;
  stockAttribution?: StockImageAttribution;
}

// Gutenberg conversion
export interface GutenbergOptions {
  highlighter: CodeHighlighter;
  seoPlugin?: string | null;
}
