/* Postgres durable layer — the production driver (DB_DRIVER=postgres + DATABASE_URL).
 *
 * Each aggregate is one row of JSONB: `(id text primary key, data jsonb,
 * updated_at timestamptz)`. `pg` is lazy-loaded so it isn't needed for the default
 * memory driver or for typecheck. Table names come from the registry (fixed
 * constants), never from user input, so interpolating them is safe. */

import type { KvStore, Repository } from './types.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */

let poolPromise: Promise<any> | null = null;

async function getPool(url: string): Promise<any> {
  if (!poolPromise) {
    poolPromise = (async () => {
      const pgName = 'pg'; // computed specifier → lazy, no typecheck dependency
      const pg: any = await import(pgName);
      const Pool = pg.Pool ?? pg.default?.Pool;
      return new Pool({ connectionString: url });
    })();
  }
  return poolPromise;
}

export async function query(url: string, sql: string, params: unknown[] = []): Promise<any> {
  const pool = await getPool(url);
  return pool.query(sql, params);
}

export async function closePool(): Promise<void> {
  if (poolPromise) {
    const pool = await poolPromise;
    await pool.end();
    poolPromise = null;
  }
}

export class PostgresRepository<T> implements Repository<T> {
  constructor(
    private readonly url: string,
    private readonly table: string,
  ) {}

  async list(): Promise<[string, T][]> {
    const res = await query(this.url, `SELECT id, data FROM ${this.table} ORDER BY updated_at`);
    return res.rows.map((r: any) => [r.id as string, r.data as T]);
  }
  async get(id: string): Promise<T | null> {
    const res = await query(this.url, `SELECT data FROM ${this.table} WHERE id = $1`, [id]);
    return res.rows[0] ? (res.rows[0].data as T) : null;
  }
  async save(id: string, value: T): Promise<void> {
    await query(
      this.url,
      `INSERT INTO ${this.table} (id, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [id, JSON.stringify(value)],
    );
  }
  async delete(id: string): Promise<void> {
    await query(this.url, `DELETE FROM ${this.table} WHERE id = $1`, [id]);
  }
}

export class PostgresKv implements KvStore {
  constructor(
    private readonly url: string,
    private readonly table = 'idempotency',
  ) {}

  async list(): Promise<[string, string][]> {
    const res = await query(this.url, `SELECT k, v FROM ${this.table}`);
    return res.rows.map((r: any) => [r.k as string, r.v as string]);
  }
  async get(key: string): Promise<string | null> {
    const res = await query(this.url, `SELECT v FROM ${this.table} WHERE k = $1`, [key]);
    return res.rows[0] ? (res.rows[0].v as string) : null;
  }
  async set(key: string, value: string): Promise<void> {
    await query(
      this.url,
      `INSERT INTO ${this.table} (k, v) VALUES ($1, $2)
       ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`,
      [key, value],
    );
  }
  async delete(key: string): Promise<void> {
    await query(this.url, `DELETE FROM ${this.table} WHERE k = $1`, [key]);
  }
}
