/* Runtime configuration, sourced from environment with sensible defaults. */

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '0.0.0.0',
  basePath: '/api/v1',
  /** Static token the mock issues and accepts. */
  staticToken: process.env.MOCK_TOKEN ?? 'mock-token-corpus',
  /** When set, the PubMed provider hits live NCBI E-utilities. */
  useLivePubmed: process.env.USE_LIVE_PUBMED === '1',
  /** Per-event delay (ms) for the simulated SSE pipeline. */
  streamStepMs: Number(process.env.STREAM_STEP_MS ?? 220),
} as const;
