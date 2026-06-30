/* Provider & enricher registry. Maps ids to constructors and resolves the
 * active set from config, so adding a source is: implement the contract, add one
 * line here. The aggregator consumes resolveProviders()/resolveEnrichers(). */

import { config } from '../config.ts';
import type { LiteratureProvider, PaperEnricher } from './provider.ts';
import { MockProvider } from './mock.ts';
import { PubMedProvider } from './pubmed.ts';
import { OpenAlexProvider } from './openalex.ts';
import { SemanticScholarProvider } from './semanticScholar.ts';
import { BiorxivProvider } from './biorxiv.ts';
import { SjrEnricher } from './enrichers/sjr.ts';

const PROVIDER_FACTORIES: Record<string, () => LiteratureProvider> = {
  mock: () => new MockProvider(),
  pubmed: () => new PubMedProvider(),
  openalex: () => new OpenAlexProvider(),
  'semantic-scholar': () => new SemanticScholarProvider(),
  biorxiv: () => new BiorxivProvider('biorxiv'),
  medrxiv: () => new BiorxivProvider('medrxiv'),
};

const ENRICHER_FACTORIES: Record<string, () => PaperEnricher> = {
  sjr: () => new SjrEnricher(),
};

/** Aliases so a few intuitive spellings resolve to the canonical id. */
const PROVIDER_ALIASES: Record<string, string> = {
  s2: 'semantic-scholar',
  semanticscholar: 'semantic-scholar',
  'semantic-scholar': 'semantic-scholar',
};

function resolveProviderId(id: string): string {
  return PROVIDER_ALIASES[id] ?? id;
}

/** The active search providers: the configured list, else live PubMed, else mock. */
export function resolveProviders(): LiteratureProvider[] {
  if (config.providers.length) {
    const resolved = config.providers
      .map(resolveProviderId)
      .map((id) => PROVIDER_FACTORIES[id])
      .filter((f): f is () => LiteratureProvider => Boolean(f))
      .map((f) => f());
    if (resolved.length) return resolved;
  }
  return config.useLivePubmed ? [new PubMedProvider()] : [new MockProvider()];
}

/** The active enrichers (may be empty). */
export function resolveEnrichers(): PaperEnricher[] {
  return config.enrichers
    .map((id) => ENRICHER_FACTORIES[id])
    .filter((f): f is () => PaperEnricher => Boolean(f))
    .map((f) => f());
}

export const knownProviderIds = Object.keys(PROVIDER_FACTORIES);
export const knownEnricherIds = Object.keys(ENRICHER_FACTORIES);
