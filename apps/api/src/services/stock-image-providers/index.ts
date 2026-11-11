import { config } from "../../config.js";
import { logger } from "../../lib/logger.js";
import { GiphyStockImageProvider } from "./giphy.js";
import { PexelsStockImageProvider } from "./pexels.js";
import { PixabayStockImageProvider } from "./pixabay.js";
import { UnsplashStockImageProvider } from "./unsplash.js";
import { STOCK_IMAGE_PROVIDERS, type StockImageCandidate, type StockImageProvider, type StockImageProviderName } from "./types.js";

function normalizeProviderName(value?: string): StockImageProviderName | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  return (STOCK_IMAGE_PROVIDERS as readonly string[]).includes(normalized)
    ? (normalized as StockImageProviderName)
    : undefined;
}

/**
 * Return configured stock image providers in preference order.
 * STOCK_IMAGE_PROVIDER selects the preferred provider; the others remain as
 * fallbacks so a missing rate limit/result does not immediately become a
 * gradient background.
 */
export function getConfiguredStockImageProviders(): StockImageProvider[] {
  const factories: Record<StockImageProviderName, (() => StockImageProvider) | null> = {
    unsplash: config.UNSPLASH_ACCESS_KEY ? () => new UnsplashStockImageProvider(config.UNSPLASH_ACCESS_KEY!) : null,
    pixabay: config.PIXABAY_API_KEY ? () => new PixabayStockImageProvider(config.PIXABAY_API_KEY!) : null,
    pexels: config.PEXELS_API_KEY ? () => new PexelsStockImageProvider(config.PEXELS_API_KEY!) : null,
    giphy: config.GIPHY_API_KEY ? () => new GiphyStockImageProvider(config.GIPHY_API_KEY!) : null,
  };

  const preferred = normalizeProviderName(config.STOCK_IMAGE_PROVIDER);
  const order = preferred
    ? [preferred, ...STOCK_IMAGE_PROVIDERS.filter((name) => name !== preferred)]
    : [...STOCK_IMAGE_PROVIDERS];

  return order
    .map((name) => factories[name]?.())
    .filter((provider): provider is StockImageProvider => Boolean(provider));
}

/** Search configured stock providers and return the first usable candidate. */
export async function searchStockImage(query: string): Promise<StockImageCandidate | null> {
  for (const provider of getConfiguredStockImageProviders()) {
    try {
      const candidate = (await provider.search(query))[0];
      if (!candidate) continue;
      provider.trackDownload?.(candidate);
      return candidate;
    } catch (err) {
      logger.warn({ err, provider: provider.name, query }, "Stock image search failed — trying next provider");
    }
  }
  return null;
}

export type { StockImageAttribution, StockImageCandidate, StockImageProvider } from "./types.js";
