import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Page, Paper, ResearchQuery, SearchMode, StudyDesign } from '../../../api/types.ts';
import { aggregator } from '../providers/aggregator.ts';
import { notFound, sendError } from '../errors.ts';

function asArray(v: unknown): string[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v.map(String) : [String(v)];
}

function asNumber(v: unknown): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function asBool(v: unknown): boolean | undefined {
  if (v === undefined) return undefined;
  return v === 'true' || v === '1' || v === true;
}

/** Build a ResearchQuery from flat query-string params (maps 1:1 to the drawer). */
function queryFromParams(q: Record<string, unknown>): ResearchQuery {
  return {
    question: typeof q.query === 'string' ? q.query : '',
    mode: (q.mode as SearchMode) ?? 'keyword',
    filters: {
      yearMin: asNumber(q.yearMin),
      yearMax: asNumber(q.yearMax),
      journalRank: q.journalRank as ResearchQuery['filters']['journalRank'],
      minCitations: asNumber(q.minCitations),
      excludePreprints: asBool(q.excludePreprints),
      openAccess: asBool(q.openAccess),
      fields: asArray(q.fields),
      sources: asArray(q.sources),
      countries: asArray(q.countries),
      studyDesigns: asArray(q.studyDesigns) as StudyDesign[] | undefined,
      sampleSizeMin: asNumber(q.sampleSizeMin),
      followUpMonthsMin: asNumber(q.followUpMonthsMin),
    },
  };
}

export async function papersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/papers', async (req: FastifyRequest, reply) => {
    try {
      const params = req.query as Record<string, unknown>;
      const query = queryFromParams(params);
      const limit = Math.min(asNumber(params.limit) ?? 20, 100);
      const cursor = typeof params.cursor === 'string' ? params.cursor : undefined;
      const result = await aggregator.search(query, { cursor, limit });
      return {
        items: result.items,
        nextCursor: result.nextCursor,
        total: result.total,
      } satisfies Page<Paper>;
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/papers/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const paper = await aggregator.fetch(req.params.id);
      if (!paper) throw notFound('Paper');
      return paper;
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
