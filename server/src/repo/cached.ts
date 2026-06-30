/* Write-through cache over a durable Repository.
 *
 * Exposes the synchronous Map subset the routes already use (get/has/values/
 * set/delete), so business code stays simple and fast — reads are in-memory.
 * Mutations update the cache immediately and schedule a coalesced async write to
 * the durable layer (a microtask flush dedups rapid writes to the same id).
 *
 * `cacheOnly` updates the cache WITHOUT persisting — used for the per-event
 * report partials during streaming, which are ephemeral; the durable copy is
 * written at create and at the terminal event (see jobs.ts). */

import type { KvStore, Repository } from './types.ts';

type OnError = (err: unknown) => void;

const defaultOnError: OnError = (err) =>
  process.stderr.write(`[repo] durable write failed: ${String(err)}\n`);

abstract class WriteBehind {
  private scheduled = false;
  protected readonly dirty = new Set<string>();
  protected readonly removed = new Set<string>();
  constructor(protected readonly onError: OnError = defaultOnError) {}

  protected schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      void this.flush().catch(this.onError);
    });
  }

  abstract flush(): Promise<void>;
}

export class CachedRepo<T> extends WriteBehind {
  private readonly cache = new Map<string, T>();

  constructor(
    private readonly durable: Repository<T>,
    onError?: OnError,
  ) {
    super(onError);
  }

  // --- synchronous Map-like API (drop-in for routes) ---
  get(id: string): T | undefined {
    return this.cache.get(id);
  }
  has(id: string): boolean {
    return this.cache.has(id);
  }
  values(): IterableIterator<T> {
    return this.cache.values();
  }
  /** Cache + schedule a durable write. */
  set(id: string, value: T): void {
    this.cache.set(id, value);
    this.removed.delete(id);
    this.dirty.add(id);
    this.schedule();
  }
  /** Cache only — no durable write (ephemeral streaming partials). */
  cacheOnly(id: string, value: T): void {
    this.cache.set(id, value);
  }
  delete(id: string): void {
    this.cache.delete(id);
    this.dirty.delete(id);
    this.removed.add(id);
    this.schedule();
  }

  /** Load the durable rows into the cache (startup). */
  async hydrate(): Promise<void> {
    for (const [id, value] of await this.durable.list()) this.cache.set(id, value);
  }

  /** Drain pending writes (called by the microtask, or explicitly in tests/shutdown). */
  async flush(): Promise<void> {
    const dirty = [...this.dirty];
    this.dirty.clear();
    const removed = [...this.removed];
    this.removed.clear();
    await Promise.all([
      ...dirty.map((id) => {
        const value = this.cache.get(id);
        return value === undefined ? Promise.resolve() : this.durable.save(id, value);
      }),
      ...removed.map((id) => this.durable.delete(id)),
    ]);
  }
}

export class CachedKv extends WriteBehind {
  private readonly cache = new Map<string, string>();

  constructor(
    private readonly durable: KvStore,
    onError?: OnError,
  ) {
    super(onError);
  }

  get(key: string): string | undefined {
    return this.cache.get(key);
  }
  has(key: string): boolean {
    return this.cache.has(key);
  }
  set(key: string, value: string): void {
    this.cache.set(key, value);
    this.removed.delete(key);
    this.dirty.add(key);
    this.schedule();
  }
  delete(key: string): void {
    this.cache.delete(key);
    this.dirty.delete(key);
    this.removed.add(key);
    this.schedule();
  }

  async hydrate(): Promise<void> {
    for (const [k, v] of await this.durable.list()) this.cache.set(k, v);
  }

  async flush(): Promise<void> {
    const dirty = [...this.dirty];
    this.dirty.clear();
    const removed = [...this.removed];
    this.removed.clear();
    await Promise.all([
      ...dirty.map((k) => {
        const value = this.cache.get(k);
        return value === undefined ? Promise.resolve() : this.durable.set(k, value);
      }),
      ...removed.map((k) => this.durable.delete(k)),
    ]);
  }
}
