/* Durable-driver selection. Default: in-memory. Set DB_DRIVER=postgres +
 * DATABASE_URL for Postgres. Table names are fixed constants (safe to interpolate). */

import { config } from '../config.ts';
import { MemoryKv, MemoryRepository } from './memory.ts';
import { PostgresKv, PostgresRepository } from './postgres.ts';
import type { KvStore, Repository } from './types.ts';

const usingPostgres = (): boolean => config.dbDriver === 'postgres';

export function makeRepository<T>(table: string): Repository<T> {
  return usingPostgres()
    ? new PostgresRepository<T>(config.databaseUrl, table)
    : new MemoryRepository<T>();
}

export function makeKv(table = 'idempotency'): KvStore {
  return usingPostgres() ? new PostgresKv(config.databaseUrl, table) : new MemoryKv();
}
