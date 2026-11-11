import { fetchJson } from "./http.js";
import type { StockImageCandidate, StockImageProvider } from "./types.js";

interface PixabaySearchResponse {
  hits?: Array<{
    largeImageURL?: string;
    webformatURL?: string;
    user?: string;
    pageURL?: string;
  }>;
}

export class PixabayStockImageProvider implements StockImageProvider {
  readonly name = "pixabay";

  constructor(private readonly apiKey: string) {}

  async search(query: string): Promise<StockImageCandidate[]> {
    const params = new URLSearchParams({
      key: this.apiKey,
      q: query,
      image_type: "photo",
      orientation: "horizontal",
      per_page: "30",
      safesearch: "true",
    });
    const data = await fetchJson<PixabaySearchResponse>(`https://pixabay.com/api/?${params}`);

    return (data.hits ?? [])
      .map((hit): StockImageCandidate | null => {
        const url = hit.largeImageURL || hit.webformatURL;
        if (!url) return null;
        return {
          url,
          attribution: {
            provider: "Pixabay",
            authorName: hit.user ?? null,
            authorUrl: null,
            sourceUrl: hit.pageURL ?? null,
          },
        } satisfies StockImageCandidate;
      })
      .filter((candidate): candidate is StockImageCandidate => candidate !== null);
  }
}
