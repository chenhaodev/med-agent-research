/* Composite pagination cursor.
 *
 * With a single provider, a cursor can pass straight through. With several
 * providers fanned out in parallel, each has its own native cursor (an offset,
 * an opaque token, a date window). A composite cursor bundles them into one
 * opaque string the client round-trips without understanding: a base64url-
 * encoded map of { providerId -> that provider's nextCursor }.
 *
 * A provider that has exhausted its results simply drops out of the map; when
 * the map is empty there is no next page. The first request carries no cursor,
 * so every provider starts from its own beginning. */

export type ProviderCursors = Record<string, string>;

/** Decode a composite cursor into per-provider cursors. Unknown/garbage input
 *  decodes to an empty map (treated as "start from the beginning"). */
export function decodeCursor(cursor?: string): ProviderCursors {
  if (!cursor) return {};
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: ProviderCursors = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v.length) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Encode per-provider next cursors into one opaque string, or undefined when
 *  every provider is exhausted (no next page). */
export function encodeCursor(cursors: ProviderCursors): string | undefined {
  const entries = Object.entries(cursors).filter(([, v]) => typeof v === 'string' && v.length);
  if (!entries.length) return undefined;
  const obj = Object.fromEntries(entries);
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}
