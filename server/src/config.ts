/* Runtime configuration, sourced from environment with sensible defaults. */

/** Parse a comma/space-separated env list into trimmed, lowercased ids. */
function parseList(v: string | undefined): string[] {
  return (v ?? '')
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '0.0.0.0',
  basePath: '/api/v1',
  /** Static token the mock issues and accepts. */
  staticToken: process.env.MOCK_TOKEN ?? 'mock-token-corpus',
  /** When set, the PubMed provider hits live NCBI E-utilities. */
  useLivePubmed: process.env.USE_LIVE_PUBMED === '1',
  /** Active search providers, e.g. "openalex,semantic-scholar,biorxiv". When
   *  empty, falls back to PubMed (if USE_LIVE_PUBMED) or the mock fixtures. */
  providers: parseList(process.env.CORPUS_PROVIDERS),
  /** Active enrichers, e.g. "sjr". Run over the merged result set. */
  enrichers: parseList(process.env.CORPUS_ENRICHERS),
  /** Per-event delay (ms) for the simulated SSE pipeline. */
  streamStepMs: Number(process.env.STREAM_STEP_MS ?? 220),
} as const;
