import { fetchJson } from "./http.js";
import type { StockImageCandidate, StockImageProvider } from "./types.js";

interface PexelsSearchResponse {
  photos?: Array<{
    url?: string;
    photographer?: string;
    photographer_url?: string;
    src?: {
      landscape?: string;
      large2x?: string;
      large?: string;
      original?: string;
    };
  }>;
}

export class PexelsStockImageProvider implements StockImageProvider {
  readonly name = "pexels";

  constructor(private readonly apiKey: string) {}

  async search(query: string): Promise<StockImageCandidate[]> {
    const params = new URLSearchParams({ query, orientation: "landscape", per_page: "30" });
    const data = await fetchJson<PexelsSearchResponse>(`https://api.pexels.com/v1/search?${params}`, {
      headers: { Authorization: this.apiKey },
    });

    return (data.photos ?? [])
      .map((photo): StockImageCandidate | null => {
        const url = photo.src?.landscape || photo.src?.large2x || photo.src?.large || photo.src?.original;
        if (!url) return null;
        return {
          url,
          attribution: {
            provider: "Pexels",
            authorName: photo.photographer ?? null,
            authorUrl: photo.photographer_url ?? null,
            sourceUrl: photo.url ?? null,
          },
        } satisfies StockImageCandidate;
      })
      .filter((candidate): candidate is StockImageCandidate => candidate !== null);
  }
}
