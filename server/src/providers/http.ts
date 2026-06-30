/* Tiny fetch helpers shared by the live providers. Centralizes error wrapping so
 * a provider body reads as "map this URL to Papers", not boilerplate. Tests stub
 * globalThis.fetch, so these stay network-free under test. */

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`GET ${redact(url)} -> ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function getText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`GET ${redact(url)} -> ${res.status} ${res.statusText}`);
  return res.text();
}

/** Strip api_key / mailto params from a URL before it lands in an error message. */
function redact(url: string): string {
  return url.replace(/([?&])(api_key|mailto)=[^&]*/gi, '$1$2=***');
}
