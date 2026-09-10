export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = null;

  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
    }
  }

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  return body as T;
}
