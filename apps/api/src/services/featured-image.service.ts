/**
 * Featured image generator.
 * Uses sharp for background resize/crop. Background sources: uploaded image,
 * stock image providers, or gradient fallback. AI mode delegates to the
 * configured image provider, then sharp normalizes every result to 1200x628.
 */

import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";
import axios from "axios";
import { isPrivateUrl } from "../lib/url-validation.js";
import { logger } from "../lib/logger.js";
import { createImageProvider } from "./image-providers/index.js";
import { fetchRemoteImage } from "./image-providers/http.js";
import { getConfiguredStockImageProviders } from "./stock-image-providers/index.js";
import type { StockImageAttribution, StockImageCandidate } from "./stock-image-providers/types.js";
import type {
  FeaturedImageRequest,
  FeaturedImageResult,
} from "../types/index.js";

const WIDTH = 1200;
const HEIGHT = 628;

// Gradient color pairs for fallback backgrounds when no image is set.
// Deterministically selected by category name for visual consistency.
const GRADIENTS: [string, string][] = [
  ["#1a1a2e", "#16213e"], // deep navy
  ["#0f3460", "#533483"], // navy → purple
  ["#2d3436", "#636e72"], // charcoal
  ["#1b1b2f", "#162447"], // midnight
  ["#0a3d62", "#3c6382"], // ocean blue
  ["#6a0572", "#ab83a1"], // plum
  ["#1e3a5f", "#4a8db7"], // steel blue
  ["#2c3e50", "#3498db"], // dark → bright blue
];

// In-memory cache for stock search results (metadata only, not image bytes).
const stockSearchCache = new Map<string, StockImageCandidate[]>();

/** Simple string hash for deterministic image selection. */
function hashString(str: string): number {
  let hash = 0;
  for (const ch of str) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return Math.abs(hash);
}

interface StockImageResult {
  buffer: Buffer;
  attribution: StockImageAttribution;
}

export class FeaturedImageService {
  /**
   * Fetch a landscape stock image for a category. Providers are tried in
   * configured order; results are cached per provider/category and the chosen
   * image is selected deterministically by post title.
   */
  private async fetchStockBackground(category: string, title: string): Promise<StockImageResult | null> {
    const providers = getConfiguredStockImageProviders();
    if (providers.length === 0) return null;

    for (const provider of providers) {
      const cacheKey = `${provider.name}:${category}`;
      let candidates = stockSearchCache.get(cacheKey);

      if (!candidates) {
        try {
          candidates = await provider.search(category);
          stockSearchCache.set(cacheKey, candidates);
          logger.info({ provider: provider.name, category, count: candidates.length }, "Cached stock image search results for category");
        } catch (err) {
          logger.warn({ err, provider: provider.name, category }, "Stock image search failed — trying next provider");
          continue;
        }
      }

      if (candidates.length === 0) continue;

      const index = hashString(title) % candidates.length;
      const candidate = candidates[index];

      try {
        provider.trackDownload?.(candidate);
        const buffer = await fetchRemoteImage(candidate.url);
        logger.info(
          { provider: provider.name, category, title, index, author: candidate.attribution.authorName },
          "Selected stock image background",
        );
        return { buffer, attribution: candidate.attribution };
      } catch (err) {
        logger.warn({ err, provider: provider.name, category, imageUrl: candidate.url }, "Stock image download failed — trying next provider");
      }
    }

    return null;
  }

  /** Generate a gradient background when no image is configured. */
  private async generateGradientBackground(categoryName: string): Promise<Buffer> {
    let hash = 0;
    for (const ch of categoryName) hash = (hash + ch.charCodeAt(0)) % GRADIENTS.length;
    const [color1, color2] = GRADIENTS[hash];

    const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${color1}" />
          <stop offset="100%" stop-color="${color2}" />
        </linearGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)" />
    </svg>`;

    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  /** Generate a featured image and return PNG bytes with optional stock attribution. */
  async generate(params: FeaturedImageRequest): Promise<FeaturedImageResult> {
    // AI-generated mode: delegate to the configured provider, then normalize here
    // so every provider produces the same 1200x628 PNG output.
    if (params.mode === "AI_GENERATED") {
      if (!params.aiImageProvider) {
        throw new Error("No AI image provider configured for this blog");
      }
      const provider = createImageProvider(params.aiImageProvider);
      const generated = await provider.generate({
        title: params.title,
        category: params.category,
        style: params.aiImageStyle || "cyberpunk",
        tags: params.tags,
      });
      const buffer = await sharp(generated)
        .resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" })
        .png()
        .toBuffer();
      return { buffer };
    }

    let resized: Buffer;
    let stockAttribution: StockImageAttribution | undefined;

    if (params.backgroundImageUrl) {
      // Load background — URL over HTTP, or a plain filename from bundled assets.
      // Uploaded backgrounds live in the tenant's own WordPress media library and
      // arrive as an ordinary https URL, so they take the same path as one typed
      // in by hand.
      let bgBuffer: Buffer;
      const bg = params.backgroundImageUrl;
      if (bg.startsWith("http://") || bg.startsWith("https://")) {
        if (await isPrivateUrl(bg)) {
          throw new Error("Background image URL points to a private/internal address");
        }
        const res = await axios.get<ArrayBuffer>(bg, {
          responseType: "arraybuffer",
          timeout: 30_000,
          maxRedirects: 0,
        });
        bgBuffer = Buffer.from(res.data);
      } else {
        const localPath = path.join(
          process.cwd(),
          "public",
          "category-images",
          path.basename(bg),
        );
        bgBuffer = await fs.readFile(localPath);
      }

      // Resize background with attention-based smart crop
      resized = await sharp(bgBuffer)
        .resize(WIDTH, HEIGHT, { fit: "cover", position: "attention" })
        .png()
        .toBuffer();
    } else {
      // No background image configured — try configured stock providers, then gradient fallback
      const stockResult = await this.fetchStockBackground(params.category, params.title);
      if (stockResult) {
        resized = await sharp(stockResult.buffer)
          .resize(WIDTH, HEIGHT, { fit: "cover", position: "attention" })
          .png()
          .toBuffer();
        stockAttribution = stockResult.attribution;
      } else {
        resized = await this.generateGradientBackground(params.category);
      }
    }

    return { buffer: resized, stockAttribution };
  }
}
