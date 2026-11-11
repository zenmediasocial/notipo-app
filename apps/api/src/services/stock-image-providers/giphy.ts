import { fetchJson } from "./http.js";
import type { StockImageCandidate, StockImageProvider } from "./types.js";

interface GiphySearchResponse {
  data?: Array<{
    url?: string;
    username?: string;
    user?: {
      display_name?: string;
      profile_url?: string;
    };
    images?: {
      original_still?: { url?: string };
      downsized_still?: { url?: string };
      original?: { url?: string };
    };
  }>;
}

export class GiphyStockImageProvider implements StockImageProvider {
  readonly name = "giphy";

  constructor(private readonly apiKey: string) {}

  async search(query: string): Promise<StockImageCandidate[]> {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      q: query,
      limit: "30",
      rating: "pg",
    });
    const data = await fetchJson<GiphySearchResponse>(`https://api.giphy.com/v1/gifs/search?${params}`);

    return (data.data ?? [])
      .map((gif): StockImageCandidate | null => {
        const url = gif.images?.original_still?.url || gif.images?.downsized_still?.url || gif.images?.original?.url;
        if (!url) return null;
        return {
          url,
          attribution: {
            provider: "GIPHY",
            authorName: gif.user?.display_name || gif.username || null,
            authorUrl: gif.user?.profile_url ?? null,
            sourceUrl: gif.url ?? null,
          },
        } satisfies StockImageCandidate;
      })
      .filter((candidate): candidate is StockImageCandidate => candidate !== null);
  }
}
