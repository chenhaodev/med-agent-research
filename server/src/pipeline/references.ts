/* Builds the report's 50 references. The first three reproduce the anchor
 * references hard-coded in `report.html`; the rest are generated server-side —
 * replacing the frontend's deleted `buildPlaceholderRefs()` with API-supplied
 * data of the same shape. */

import type { Reference } from '../../../api/types.ts';

const ANCHORS: Reference[] = [
  {
    id: 'r1',
    number: 1,
    type: 'review',
    authors: ['Author, A.', 'Author, B.'],
    year: 2024,
    title: 'Placeholder title of a representative review.',
    venue: 'Journal Name',
    volume: '12',
    issue: '3',
    pages: '100–118',
    openAccess: true,
  },
  {
    id: 'r2',
    number: 2,
    type: 'meta-analysis',
    authors: ['Author, C. et al.'],
    year: 2023,
    title: 'Placeholder title of a meta-analysis on mixed effects.',
    venue: 'Journal Name',
    volume: '9',
    issue: '1',
    pages: '4–22',
  },
  {
    id: 'r3',
    number: 3,
    type: 'journal-article',
    authors: ['Author, D.', 'Author, E.'],
    year: 2025,
    title: 'Placeholder title on adaptive intervention design.',
    venue: 'Journal Name',
    volume: '4',
    issue: '2',
    pages: '55–71',
  },
];

function generated(n: number): Reference {
  const letter = String.fromCharCode(64 + ((n % 26) || 26));
  return {
    id: `r${n}`,
    number: n,
    type: 'journal-article',
    authors: [`Author ${letter} et al.`],
    year: 2018 + (n % 8),
    title: `Placeholder title for corpus entry ${n}.`,
    venue: 'Journal Name',
    volume: String((n % 18) + 1),
    issue: String((n % 4) + 1),
  };
}

export function buildReferences(total = 50): Reference[] {
  const refs = [...ANCHORS];
  for (let n = ANCHORS.length + 1; n <= total; n++) refs.push(generated(n));
  return refs;
}
