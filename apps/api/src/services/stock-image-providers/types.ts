export const STOCK_IMAGE_PROVIDERS = ["unsplash", "pixabay", "pexels", "giphy"] as const;
export type StockImageProviderName = (typeof STOCK_IMAGE_PROVIDERS)[number];

export interface StockImageAttribution {
  provider: string;
  authorName: string | null;
  authorUrl: string | null;
  sourceUrl: string | null;
}

export interface StockImageCandidate {
  url: string;
  attribution: StockImageAttribution;
  /** Provider-specific download tracking URL (Unsplash uses this for ToS compliance). */
  downloadLocation?: string;
}

export interface StockImageProvider {
  name: StockImageProviderName;
  search(query: string): Promise<StockImageCandidate[]>;
  trackDownload?(candidate: StockImageCandidate): void;
}
