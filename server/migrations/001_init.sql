-- Phase 4 initial schema. Each aggregate is one JSONB row keyed by its id, so the
-- repository layer round-trips the same shapes as /api/types.ts with no ORM. All
-- statements are idempotent (IF NOT EXISTS), so re-running a migration is safe.

CREATE TABLE IF NOT EXISTS reports (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_updated_at_idx ON reports (updated_at DESC);

CREATE TABLE IF NOT EXISTS jobs (
  id          text PRIMARY KEY,          -- jobId
  data        jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_searches (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS history (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collections (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Normalized-paper cache (provider results), keyed by paper id. Schema is ready;
-- provider cache-aside wiring is a follow-up (providers currently fetch live).
CREATE TABLE IF NOT EXISTS papers_cache (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Idempotency keys → report ids (a plain KV).
CREATE TABLE IF NOT EXISTS idempotency (
  k  text PRIMARY KEY,
  v  text NOT NULL
);
