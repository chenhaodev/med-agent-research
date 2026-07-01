import { describe, it, expect } from 'vitest';
import { store, defaultUser } from '../src/store.ts';
import type { ResearchQuery } from '../../api/types.ts';

const query: ResearchQuery = { question: 'q', mode: 'keyword', filters: {} };

describe('store', () => {
  it('init() hydrates and seeds the default user + Saved collection (idempotently)', async () => {
    await store.init();
    await store.init(); // second call must not duplicate
    expect(store.users.has(defaultUser.id)).toBe(true);
    expect(store.collections.has('col-saved')).toBe(true);
    expect(store.collections.get('col-saved')?.system).toBe(true);
    const savedCols = [...store.collections.values()].filter((c) => c.id === 'col-saved');
    expect(savedCols).toHaveLength(1);
  });

  it('recordHistory persists a stamped entry', () => {
    const before = [...store.history.values()].length;
    const entry = store.recordHistory({ query, reportId: 'rep_x' });
    expect(entry.id).toMatch(/^hist/);
    expect(entry.ranAt).toBeTruthy();
    expect([...store.history.values()].length).toBe(before + 1);
    expect(store.history.get(entry.id)?.reportId).toBe('rep_x');
  });

  it('idempotency KV round-trips', () => {
    store.idempotency.set('key-1', 'rep_42');
    expect(store.idempotency.has('key-1')).toBe(true);
    expect(store.idempotency.get('key-1')).toBe('rep_42');
  });
});
