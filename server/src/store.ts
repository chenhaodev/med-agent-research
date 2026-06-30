/* Data stores, backed by the repository layer.
 *
 * Each entity is a CachedRepo: a fast in-memory cache (the synchronous Map-like
 * API the routes use) write-through to a durable Repository (in-memory by
 * default, Postgres with DB_DRIVER=postgres). `init()` hydrates the caches from
 * the durable store and seeds defaults; call it once at startup. Entities are
 * replaced wholesale (never field-mutated) to keep updates immutable. */

import type {
  Collection,
  HistoryEntry,
  SavedSearch,
  SynthesisReport,
  User,
} from '../../api/types.ts';
import { makeId, nowIso } from './ids.ts';
import { CachedKv, CachedRepo } from './repo/cached.ts';
import { makeKv, makeRepository } from './repo/registry.ts';

export interface ReportJob {
  jobId: string;
  reportId: string;
  idempotencyKey?: string;
}

export const defaultUser: User = {
  id: 'u-001',
  name: 'Researcher',
  initials: 'R',
  email: 'researcher@corpus.dev',
};

const SAVED_COLLECTION_ID = 'col-saved';

const reports = new CachedRepo<SynthesisReport>(makeRepository('reports'));
const jobs = new CachedRepo<ReportJob>(makeRepository('jobs'));
const savedSearches = new CachedRepo<SavedSearch>(makeRepository('saved_searches'));
const history = new CachedRepo<HistoryEntry>(makeRepository('history'));
const collections = new CachedRepo<Collection>(makeRepository('collections'));
const users = new CachedRepo<User>(makeRepository('users'));
/** idempotencyKey -> reportId, so a repeated POST /reports returns the same id. */
const idempotency = new CachedKv(makeKv('idempotency'));

/** Hydrate caches from the durable store, then seed defaults if absent. */
async function init(): Promise<void> {
  await Promise.all([
    reports.hydrate(),
    jobs.hydrate(),
    savedSearches.hydrate(),
    history.hydrate(),
    collections.hydrate(),
    users.hydrate(),
    idempotency.hydrate(),
  ]);

  if (!users.has(defaultUser.id)) users.set(defaultUser.id, defaultUser);
  if (!collections.has(SAVED_COLLECTION_ID)) {
    const ts = nowIso();
    collections.set(SAVED_COLLECTION_ID, {
      id: SAVED_COLLECTION_ID,
      name: 'Saved',
      system: true,
      createdAt: ts,
      updatedAt: ts,
      items: [],
    });
  }
}

export const store = {
  reports,
  jobs,
  savedSearches,
  history,
  collections,
  users,
  idempotency,
  init,

  recordHistory(entry: Omit<HistoryEntry, 'id' | 'ranAt'>): HistoryEntry {
    const full: HistoryEntry = { id: makeId('hist'), ranAt: nowIso(), ...entry };
    history.set(full.id, full);
    return full;
  },
};
