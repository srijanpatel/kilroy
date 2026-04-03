/**
 * Build the public-facing base URL from a request URL.
 * Forces https unless the host is localhost or 127.0.0.1.
 */
export function getBaseUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  const isLocal =
    url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!isLocal) {
    url.protocol = "https:";
  }
  return url.origin;
}
