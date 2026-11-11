export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(`Stock image API error ${response.status}: ${errorText}`);
  }
  return response.json() as Promise<T>;
}
