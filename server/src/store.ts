/* In-memory data stores. No database: a process-lifetime set of Maps seeded
 * with a default user and a system "Saved" collection. Entities are replaced
 * wholesale (never field-mutated) to keep updates immutable. */

import type {
  Collection,
  HistoryEntry,
  SavedSearch,
  SynthesisReport,
  User,
} from '../../api/types.ts';
import { makeId, nowIso } from './ids.ts';

export interface ReportJob {
  jobId: string;
  reportId: string;
  idempotencyKey?: string;
}

const reports = new Map<string, SynthesisReport>();
const jobs = new Map<string, ReportJob>();
const savedSearches = new Map<string, SavedSearch>();
const history = new Map<string, HistoryEntry>();
const collections = new Map<string, Collection>();
/** idempotencyKey -> reportId, so a repeated POST /reports returns the same id. */
const idempotency = new Map<string, string>();

export const defaultUser: User = {
  id: 'u-001',
  name: 'Researcher',
  initials: 'R',
  email: 'researcher@corpus.dev',
};

/** Seed the system "Saved" collection (the rail's bookmark target). */
function seed(): void {
  const ts = nowIso();
  const saved: Collection = {
    id: 'col-saved',
    name: 'Saved',
    system: true,
    createdAt: ts,
    updatedAt: ts,
    items: [],
  };
  collections.set(saved.id, saved);
}
seed();

export const store = {
  reports,
  jobs,
  savedSearches,
  history,
  collections,
  idempotency,

  recordHistory(entry: Omit<HistoryEntry, 'id' | 'ranAt'>): HistoryEntry {
    const full: HistoryEntry = { id: makeId('hist'), ranAt: nowIso(), ...entry };
    history.set(full.id, full);
    return full;
  },
};
