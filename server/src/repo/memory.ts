/* In-memory durable layer — the default driver. Plain Maps behind the async
 * Repository/KvStore interfaces, so the whole server runs and is tested without a
 * database. With this driver the CachedRepo's write-through is a no-op copy. */

import type { KvStore, Repository } from './types.ts';

export class MemoryRepository<T> implements Repository<T> {
  private readonly rows = new Map<string, T>();

  async list(): Promise<[string, T][]> {
    return [...this.rows.entries()];
  }
  async get(id: string): Promise<T | null> {
    return this.rows.has(id) ? (this.rows.get(id) as T) : null;
  }
  async save(id: string, value: T): Promise<void> {
    this.rows.set(id, value);
  }
  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }
}

export class MemoryKv implements KvStore {
  private readonly rows = new Map<string, string>();

  async list(): Promise<[string, string][]> {
    return [...this.rows.entries()];
  }
  async get(key: string): Promise<string | null> {
    return this.rows.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.rows.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.rows.delete(key);
  }
}
