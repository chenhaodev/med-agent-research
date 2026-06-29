/* The fixture synthesis report, derived block-for-block from `report.html`.
 * Parameterized by the incoming query so the topic carries through (fixing the
 * "search navigates with no query payload" gap). Inline citations are written
 * as `{{cite:N}}` tokens inside prose HTML; the client swaps each token for the
 * matching `CitationRef` marker. */

import type {
  ContentBlock,
  FunnelStage,
  ResearchQuery,
  SynthesisReport,
} from '../../../api/types.ts';
import { buildReferences } from './references.ts';
import { nowIso } from '../ids.ts';

const FUNNEL_STAGES: FunnelStage[] = [
  { stage: 'retrieved', label: 'Retrieved', count: 7_500_000 },
  { stage: 'relevant', label: 'Relevant', count: 142_000 },
  { stage: 'candidates', label: 'Candidates', count: 131 },
  { stage: 'included', label: 'Included', count: 50 },
];

const TIMELINE_POINTS = [
  { year: 2003, citationCount: 5 },
  { year: 2005, citationCount: 6 },
  { year: 2008, citationCount: 7 },
  { year: 2010, citationCount: 9 },
  { year: 2012, citationCount: 8 },
  { year: 2014, citationCount: 11 },
  { year: 2016, citationCount: 10 },
  { year: 2018, citationCount: 14 },
  { year: 2020, citationCount: 16 },
  { year: 2021, citationCount: 13 },
  { year: 2022, citationCount: 18 },
  { year: 2023, citationCount: 20 },
  { year: 2024, citationCount: 15 },
];

/** The ordered report body. Extracted as a function so callers can stream the
 *  blocks one at a time or return them all at once. */
export function buildBlocks(): ContentBlock[] {
  return [
    {
      type: 'tldr',
      label: 'TL;DR',
      html:
        'The literature points to <strong>three converging frontier directions</strong>, ' +
        'while the hardest open problems concentrate around <strong>long-term effect ' +
        'durability, equitable access, and integration into existing workflows</strong>. ' +
        'The clearest real-world traction so far appears in <strong>structured, repeatable ' +
        'tasks</strong> rather than open-ended judgement.',
    },
    { type: 'heading', level: 2, number: '1', text: 'Introduction' },
    {
      type: 'prose',
      html:
        'Recent work in this field is shifting from early proof-of-concept demonstrations ' +
        'toward studies that ask <em>for whom</em>, <em>under what conditions</em>, and ' +
        '<em>at what cost</em> an intervention works. Research attention has visibly expanded ' +
        'into adaptive, data-driven decision-making and tighter coupling with the systems ' +
        'where the work actually happens{{cite:1}}.',
      citations: [
        {
          refId: 'r1',
          number: 1,
          stance: 'yes',
          tooltip: 'Placeholder reference — a representative review establishing the framing of the field.',
        },
      ],
    },
    {
      type: 'prose',
      html:
        'The evidence base, however, is uneven. Some outcomes are now supported by repeated ' +
        'randomized trials and meta-analyses, while others rest on a handful of small or ' +
        'short-horizon studies{{cite:2}}. This report maps where the evidence is strong, where ' +
        'it is thin, and where the field is heading next.',
      citations: [
        {
          refId: 'r2',
          number: 2,
          stance: 'possibly',
          tooltip: 'Placeholder reference — meta-analysis reporting mixed effect sizes across outcome types.',
        },
      ],
    },
    {
      type: 'consensusMeter',
      caption: 'Figure 1 — Distribution of study conclusions across the included corpus.',
      question: 'Is this approach effective and scalable in practice?',
      n: 17,
      buckets: [
        { stance: 'yes', count: 4, label: 'Yes · effective' },
        { stance: 'possibly', count: 7, label: 'Possibly · conditional' },
        { stance: 'mixed', count: 6, label: 'Mixed' },
      ],
    },
    { type: 'heading', level: 2, number: '2', text: 'Methods' },
    {
      type: 'prose',
      html:
        'A broad initial query was narrowed through automated relevance screening and ' +
        'de-duplication, then expanded across six sub-themes before a final relevance ranking ' +
        'selected the studies synthesized here.',
      citations: [],
    },
    {
      type: 'funnel',
      caption: 'Figure 2 — Search and screening funnel.',
      stages: FUNNEL_STAGES,
    },
    { type: 'heading', level: 2, number: '3', text: 'Results' },
    { type: 'heading', level: 3, number: '3.1', text: 'Key papers' },
    {
      type: 'prose',
      html:
        'The anchoring studies are large reviews and meta-analyses, chosen because they speak ' +
        'to both <em>what works</em> and <em>what is still missing</em>.',
      citations: [],
    },
    {
      type: 'keyPapers',
      caption: 'Figure 3 — Anchor papers in the corpus.',
      items: [
        {
          citationCount: 7,
          title: 'Placeholder title of a systematic review and meta-analysis',
          authors: 'Author et al.',
          year: 2024,
          venue: 'Journal Name',
          summary:
            'Pooled estimates show a consistent moderate effect on the primary structured outcome, with wide heterogeneity by setting.',
          refId: 'r7',
        },
        {
          citationCount: 5,
          title: 'Placeholder title of an umbrella review',
          authors: 'Author et al.',
          year: 2023,
          venue: 'Journal Name',
          summary: 'Synthesizes prior reviews and flags durability and equity as the dominant unresolved questions.',
          refId: 'r5',
        },
        {
          citationCount: 4,
          title: 'Placeholder title of a large pragmatic trial',
          authors: 'Author et al.',
          year: 2025,
          venue: 'Journal Name',
          summary: 'Demonstrates feasibility at scale but reports declining engagement over the follow-up window.',
          refId: 'r4',
        },
      ],
    },
    { type: 'heading', level: 3, number: '3.2', text: 'Frontier directions' },
    {
      type: 'prose',
      html:
        'The first frontier is <strong>adaptive, individualized decision-making</strong>, where ' +
        'models adjust intervention timing and intensity from real-time context{{cite:3}}. The ' +
        'second is <strong>privacy-preserving, on-device computation</strong>, which trades raw ' +
        'performance for data locality and trust{{cite:4}}. The third is <strong>workflow ' +
        'augmentation</strong> — moving from a standalone tool toward something embedded in ' +
        'everyday practice, with measurable time savings reported{{cite:5}}.',
      citations: [
        { refId: 'r3', number: 3, stance: 'yes', tooltip: 'Placeholder reference — methods paper on adaptive intervention design.' },
        { refId: 'r4', number: 4, stance: 'possibly', tooltip: 'Placeholder reference — study on edge / federated approaches under resource constraints.' },
        { refId: 'r5', number: 5, stance: 'yes', tooltip: 'Placeholder reference — evaluation reporting reduced task time and high acceptability.' },
      ],
    },
    { type: 'heading', level: 3, number: '3.3', text: 'Hot application areas' },
    {
      type: 'evidenceMatrix',
      caption: 'Figure 4 — Popular deployment directions and their evidence signal.',
      rows: [
        { direction: 'Direction A', outcomes: 'Primary metric, adherence, self-management', grade: 'strong', paperCount: 14 },
        { direction: 'Direction B', outcomes: 'Symptom reduction, engagement', grade: 'moderate', paperCount: 9 },
        { direction: 'Direction C', outcomes: 'Access, follow-up completion', grade: 'moderate', paperCount: 7 },
        { direction: 'Direction D', outcomes: 'Workflow integration, productivity', grade: 'emerging', paperCount: 5 },
      ],
    },
    { type: 'heading', level: 3, number: '3.4', text: 'Research timeline' },
    {
      type: 'prose',
      html:
        'Activity has accelerated markedly in recent years, with the largest and most-cited ' +
        'studies clustering toward the present.',
      citations: [],
    },
    {
      type: 'timeline',
      caption: 'Figure 5 — Publications over time; larger markers indicate more citations.',
      axis: { from: 2005, to: 2025 },
      points: TIMELINE_POINTS,
    },
    { type: 'heading', level: 2, number: '4', text: 'Discussion' },
    {
      type: 'prose',
      html:
        'The strongest results cluster around outcomes that are <strong>concrete, measurable, ' +
        'and trackable over short horizons</strong>. As tasks require more sustained behaviour ' +
        'change or deeper integration, the evidence thins and implementation difficulty ' +
        'rises{{cite:6}}.',
      citations: [
        { refId: 'r6', number: 6, stance: 'mixed', tooltip: 'Placeholder reference — discussion of the evidence-to-deployment gap.' },
      ],
    },
    {
      type: 'claims',
      caption: 'Figure 6 — Key claims and the strength of their supporting evidence.',
      rows: [
        {
          claim: 'Effective for structured, repeatable tasks',
          strength: 'strong',
          reasoning: 'Repeated across multiple meta-analyses with consistent direction.',
          refIds: ['r1', 'r7'],
        },
        {
          claim: 'Effects persist beyond 12 months',
          strength: 'moderate',
          reasoning: 'Few studies report long-term follow-up; signals weaken over time.',
          refIds: ['r4'],
        },
        {
          claim: 'Benefits are equitably distributed',
          strength: 'weak',
          reasoning: 'Access and adoption gaps appear at multiple stages.',
          refIds: ['r6'],
        },
      ],
    },
    { type: 'heading', level: 2, number: '5', text: 'Conclusion' },
    {
      type: 'prose',
      html:
        'The frontier is clear, but success is decided less by the core method than by the ' +
        '<strong>implementation questions around it</strong> — durability, interoperability, ' +
        'trust, and equitable access. The most valuable near-term opportunities remain the ' +
        'high-frequency, standardized tasks that fit cleanly into existing workflows{{cite:7}}.',
      citations: [
        { refId: 'r7', number: 7, stance: 'yes', tooltip: 'Placeholder reference — concluding synthesis on deployment priorities.' },
      ],
    },
    { type: 'heading', level: 3, text: 'Research gaps' },
    {
      type: 'gapHeatmap',
      caption: 'Figure 7 — Coverage heat-map; darker amber / coral indicates thinner evidence.',
      dimensions: ['Long-term', 'Equity', 'Integration'],
      rows: [
        { topic: 'Direction A', cells: [{ dimension: 'Long-term', level: 'high' }, { dimension: 'Equity', level: 'med' }, { dimension: 'Integration', level: 'low' }] },
        { topic: 'Direction B', cells: [{ dimension: 'Long-term', level: 'med' }, { dimension: 'Equity', level: 'low' }, { dimension: 'Integration', level: 'med' }] },
        { topic: 'Direction C', cells: [{ dimension: 'Long-term', level: 'low' }, { dimension: 'Equity', level: 'low' }, { dimension: 'Integration', level: 'high' }] },
      ],
    },
    { type: 'heading', level: 3, text: 'Open research questions' },
    {
      type: 'openQuestions',
      items: [
        {
          question: 'How can long-term engagement be sustained without increasing user burden?',
          answer:
            'Sustained retention directly bounds achievable effect sizes and the value of any adaptive model; current studies rarely follow users long enough to answer it.',
        },
        {
          question: 'Which subgroups are systematically under-served, and why?',
          answer:
            'Access, adoption, and adherence gaps recur across the corpus, but disaggregated reporting is rare — making the mechanisms hard to target.',
        },
        {
          question: 'What does safe, governed integration into existing systems require?',
          answer:
            'Interoperability standards, governance, and trust appear to be the binding constraint on turning efficacy into scaled, dependable service delivery.',
        },
      ],
    },
  ];
}

/** Assemble a complete report for a query. `status` defaults to complete; the
 *  streaming path constructs a queued shell and fills it block-by-block. */
export function buildReport(id: string, query: ResearchQuery): SynthesisReport {
  const ts = nowIso();
  const topic = query.question.trim() || '[your research topic]';
  return {
    id,
    query,
    status: 'complete',
    version: 1,
    generatedAt: '2026-06-15T00:00:00.000Z',
    updatedAt: ts,
    cadence: 'weekly',
    topic,
    readingTimeMin: 6,
    consensus: { label: 'Moderate-to-strong consensus', strength: 'moderate' },
    metrics: { contributingStudies: 17, corpusSize: 50 },
    funnel: { stages: FUNNEL_STAGES },
    blocks: buildBlocks(),
    references: buildReferences(50),
  };
}
