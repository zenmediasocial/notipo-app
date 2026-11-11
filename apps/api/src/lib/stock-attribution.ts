import type { StockImageAttribution } from "../services/stock-image-providers/types.js";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function withUtm(url: string, provider: string): string {
  if (provider !== "Unsplash") return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}utm_source=notipo&utm_medium=referral`;
}

/** Build the Gutenberg paragraph used to credit a stock image source. */
export function buildStockAttributionBlock(attribution: StockImageAttribution): string {
  const provider = escapeHtml(attribution.provider);
  const authorName = attribution.authorName ? escapeHtml(attribution.authorName) : provider;
  const author = attribution.authorUrl
    ? `<a href="${escapeHtml(withUtm(attribution.authorUrl, attribution.provider))}">${authorName}</a>`
    : authorName;
  const source = attribution.sourceUrl
    ? `<a href="${escapeHtml(withUtm(attribution.sourceUrl, attribution.provider))}">${provider}</a>`
    : provider;

  return `\n\n<!-- wp:paragraph {"className":"stock-image-credit","style":{"typography":{"fontSize":"14px"}}} -->\n<p class="stock-image-credit" style="font-size:14px">Image by ${author} on ${source}</p>\n<!-- /wp:paragraph -->`;
}
