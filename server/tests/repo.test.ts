import { describe, it, expect } from 'vitest';
import { MemoryKv, MemoryRepository } from '../src/repo/memory.ts';
import { CachedKv, CachedRepo } from '../src/repo/cached.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('MemoryRepository', () => {
  it('round-trips CRUD and lists [id, value] pairs', async () => {
    const r = new MemoryRepository<{ n: number }>();
    await r.save('a', { n: 1 });
    await r.save('b', { n: 2 });
    expect(await r.get('a')).toEqual({ n: 1 });
    expect(await r.get('missing')).toBeNull();
    expect(await r.list()).toContainEqual(['a', { n: 1 }]);
    await r.delete('a');
    expect(await r.get('a')).toBeNull();
  });
});

describe('CachedRepo (write-through cache)', () => {
  it('reads from cache synchronously and persists to the durable layer', async () => {
    const durable = new MemoryRepository<{ n: number }>();
    const cached = new CachedRepo(durable);
    cached.set('a', { n: 1 });
    expect(cached.get('a')).toEqual({ n: 1 }); // sync cache read, before any await
    await cached.flush();
    expect(await durable.get('a')).toEqual({ n: 1 }); // written through
  });

  it('auto-flushes on a microtask without an explicit flush', async () => {
    const durable = new MemoryRepository<{ n: number }>();
    const cached = new CachedRepo(durable);
    cached.set('a', { n: 1 });
    await tick();
    expect(await durable.get('a')).toEqual({ n: 1 });
  });

  it('cacheOnly updates the cache but never persists', async () => {
    const durable = new MemoryRepository<{ n: number }>();
    const cached = new CachedRepo(durable);
    cached.cacheOnly('a', { n: 9 });
    await cached.flush();
    expect(cached.get('a')).toEqual({ n: 9 });
    expect(await durable.get('a')).toBeNull(); // ephemeral partial, not durable
  });

  it('delete removes from cache and durable', async () => {
    const durable = new MemoryRepository<{ n: number }>();
    await durable.save('a', { n: 1 });
    const cached = new CachedRepo(durable);
    await cached.hydrate();
    expect(cached.get('a')).toEqual({ n: 1 });
    cached.delete('a');
    expect(cached.has('a')).toBe(false);
    await cached.flush();
    expect(await durable.get('a')).toBeNull();
  });

  it('hydrate loads durable rows into the cache', async () => {
    const durable = new MemoryRepository<{ n: number }>();
    await durable.save('x', { n: 7 });
    const cached = new CachedRepo(durable);
    expect(cached.get('x')).toBeUndefined();
    await cached.hydrate();
    expect(cached.get('x')).toEqual({ n: 7 });
  });

  it('coalesces rapid writes to the same id into one durable save', async () => {
    let saves = 0;
    const durable = new MemoryRepository<{ n: number }>();
    const orig = durable.save.bind(durable);
    durable.save = async (id, v) => {
      saves += 1;
      return orig(id, v);
    };
    const cached = new CachedRepo(durable);
    cached.set('a', { n: 1 });
    cached.set('a', { n: 2 });
    cached.set('a', { n: 3 });
    await cached.flush();
    expect(saves).toBe(1); // one write for the latest value
    expect(await durable.get('a')).toEqual({ n: 3 });
  });
});

describe('CachedKv', () => {
  it('write-through and hydrate', async () => {
    const durable = new MemoryKv();
    const kv = new CachedKv(durable);
    kv.set('k', 'v');
    expect(kv.get('k')).toBe('v');
    expect(kv.has('k')).toBe(true);
    await kv.flush();
    expect(await durable.get('k')).toBe('v');

    const kv2 = new CachedKv(durable);
    await kv2.hydrate();
    expect(kv2.get('k')).toBe('v');
  });
});
