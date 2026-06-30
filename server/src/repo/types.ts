/* Repository contract. Business logic depends on these interfaces, not on
 * storage details. Default driver is in-memory (offline, tested); a Postgres
 * driver implements the same shape for durability. Same abstraction+mock-default
 * +real-adapter-behind-a-flag pattern as providers / LLM / queue.
 *
 * Keyed by an explicit `id` string (not a field on T), so aggregates whose key
 * isn't named `id` (e.g. a job keyed by jobId) fit without contortion. */

export interface Repository<T> {
  /** All rows as [id, value] pairs (used to hydrate the cache). */
  list(): Promise<[string, T][]>;
  get(id: string): Promise<T | null>;
  save(id: string, value: T): Promise<void>; // upsert
  delete(id: string): Promise<void>;
}

/** String key/value store (idempotency keys → report ids). */
export interface KvStore {
  list(): Promise<[string, string][]>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
