/* Migration runner. Applies un-applied migrations/*.sql in order, tracking them
 * in schema_migrations. Idempotent DDL means re-running is safe. Only meaningful
 * with Postgres; run via `npm run migrate` (needs DATABASE_URL).
 *
 *   DB_DRIVER=postgres DATABASE_URL=postgres://… npm run migrate
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from '../config.ts';
import { closePool, query } from './postgres.ts';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

export function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/** Apply pending migrations; returns the versions that ran this time. */
export async function migrate(url: string = config.databaseUrl): Promise<string[]> {
  await query(
    url,
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  const appliedRes = await query(url, 'SELECT version FROM schema_migrations');
  const applied = new Set<string>(appliedRes.rows.map((r: { version: string }) => r.version));

  const ran: string[] = [];
  for (const file of migrationFiles()) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    await query(url, sql); // statements are idempotent; safe to retry on failure
    await query(url, 'INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
    ran.push(file);
  }
  return ran;
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  migrate()
    .then((ran) => {
      process.stdout.write(`migrations applied: ${ran.length ? ran.join(', ') : '(none pending)'}\n`);
    })
    .catch((err) => {
      process.stderr.write(`migration failed: ${String(err)}\n`);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
