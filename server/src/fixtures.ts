/* Loads JSON fixtures from `/server/fixtures` at startup. Reading via fs (rather
 * than JSON imports) keeps the code loader-agnostic across tsx/node. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Facets, Paper } from '../../api/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', 'fixtures');

function load<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) as T;
}

export const facetsFixture: Facets = load<Facets>('facets.json');
export const papersFixture: Paper[] = load<Paper[]>('papers.json');
