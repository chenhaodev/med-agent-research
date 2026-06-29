/* Monotonic, prefixed id generator. Deterministic per-process counter avoids
 * pulling in a uuid dependency and keeps ids readable in logs/tests. */

let counter = 0;

export function makeId(prefix: string): string {
  counter += 1;
  const stamp = Date.now().toString(36);
  return `${prefix}_${stamp}${counter.toString(36).padStart(2, '0')}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
