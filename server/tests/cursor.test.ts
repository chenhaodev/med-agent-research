import { describe, it, expect } from 'vitest';
import { decodeCursor, encodeCursor } from '../src/providers/cursor.ts';

describe('composite cursor codec', () => {
  it('round-trips a multi-provider cursor map', () => {
    const cursors = { openalex: 'abc*', 'semantic-scholar': '20', biorxiv: '30' };
    const encoded = encodeCursor(cursors);
    expect(typeof encoded).toBe('string');
    expect(decodeCursor(encoded)).toEqual(cursors);
  });

  it('returns undefined when every provider is exhausted', () => {
    expect(encodeCursor({})).toBeUndefined();
    expect(encodeCursor({ openalex: '' })).toBeUndefined();
  });

  it('decodes an empty/garbage cursor to an empty map (start from the beginning)', () => {
    expect(decodeCursor(undefined)).toEqual({});
    expect(decodeCursor('')).toEqual({});
    expect(decodeCursor('not-base64-json!!!')).toEqual({});
  });

  it('drops non-string cursor values on decode', () => {
    const encoded = Buffer.from(JSON.stringify({ a: '1', b: 5, c: null }), 'utf8').toString('base64url');
    expect(decodeCursor(encoded)).toEqual({ a: '1' });
  });
});
