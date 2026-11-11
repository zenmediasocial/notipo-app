const MAX_REMOTE_IMAGE_BYTES = 30 * 1024 * 1024;

/** Download a provider-returned image URL with basic protocol, size, and timeout guards. */
export async function fetchRemoteImage(url: string): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error(`AI image provider returned a non-HTTPS image URL: ${url}`);
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`Failed to download generated image: HTTP ${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REMOTE_IMAGE_BYTES) {
    throw new Error(`Generated image is too large (${contentLength} bytes)`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_REMOTE_IMAGE_BYTES) {
    throw new Error(`Generated image is too large (${buffer.byteLength} bytes)`);
  }
  return buffer;
}
