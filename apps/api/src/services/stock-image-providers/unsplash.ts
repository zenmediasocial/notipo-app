import { fetchJson } from "./http.js";
import type { StockImageCandidate, StockImageProvider } from "./types.js";

interface UnsplashSearchResponse {
  results?: Array<{
    id: string;
    urls: { regular: string };
    links: { download_location: string; html?: string };
    user: { name: string; links: { html: string } };
  }>;
}

export class UnsplashStockImageProvider implements StockImageProvider {
  readonly name = "unsplash";

  constructor(private readonly apiKey: string) {}

  async search(query: string): Promise<StockImageCandidate[]> {
    const params = new URLSearchParams({ query, orientation: "landscape", per_page: "30" });
    const data = await fetchJson<UnsplashSearchResponse>(`https://api.unsplash.com/search/photos?${params}`, {
      headers: { Authorization: `Client-ID ${this.apiKey}` },
    });

    return (data.results ?? []).map((photo) => ({
      url: photo.urls.regular,
      downloadLocation: photo.links.download_location,
      attribution: {
        provider: "Unsplash",
        authorName: photo.user.name,
        authorUrl: photo.user.links.html,
        sourceUrl: photo.links.html ?? null,
      },
    }));
  }

  trackDownload(candidate: StockImageCandidate): void {
    if (!candidate.downloadLocation) return;
    void fetch(candidate.downloadLocation, {
      headers: { Authorization: `Client-ID ${this.apiKey}` },
      signal: AbortSignal.timeout(5_000),
    }).catch(() => {});
  }
}
