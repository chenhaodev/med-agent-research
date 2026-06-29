import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Collection, CollectionItem, CollectionItemRef } from '../../../api/types.ts';
import { store } from '../store.ts';
import { makeId, nowIso } from '../ids.ts';
import { requireAuth } from '../auth.ts';
import { badRequest, notFound, sendError } from '../errors.ts';

function getCollection(id: string): Collection {
  const col = store.collections.get(id);
  if (!col) throw notFound('Collection');
  return col;
}

export async function collectionsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/collections', async (req, reply) => {
    try {
      requireAuth(req);
      return [...store.collections.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/collections', async (req: FastifyRequest, reply) => {
    try {
      requireAuth(req);
      const body = (req.body ?? {}) as { name?: string };
      if (!body.name) throw badRequest('name is required');
      const ts = nowIso();
      const col: Collection = {
        id: makeId('col'),
        name: body.name,
        createdAt: ts,
        updatedAt: ts,
        items: [],
      };
      store.collections.set(col.id, col);
      return reply.code(201).send(col);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/collections/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      requireAuth(req);
      return getCollection(req.params.id);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/collections/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      requireAuth(req);
      const col = getCollection(req.params.id);
      const body = (req.body ?? {}) as { name?: string };
      const updated: Collection = { ...col, name: body.name ?? col.name, updatedAt: nowIso() };
      store.collections.set(updated.id, updated);
      return updated;
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/collections/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      requireAuth(req);
      const col = getCollection(req.params.id);
      if (col.system) throw badRequest('Cannot delete a system collection');
      store.collections.delete(col.id);
      return reply.code(204).send();
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // ---- Items ----
  app.post(
    '/collections/:id/items',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
      try {
        requireAuth(req);
        const col = getCollection(req.params.id);
        const body = (req.body ?? {}) as { ref?: CollectionItemRef; notes?: string };
        if (!body.ref || !body.ref.kind || !body.ref.id) throw badRequest('ref { kind, id } is required');
        const item: CollectionItem = {
          id: makeId('item'),
          ref: body.ref,
          notes: body.notes,
          addedAt: nowIso(),
        };
        const updated: Collection = {
          ...col,
          items: [...col.items, item],
          updatedAt: nowIso(),
        };
        store.collections.set(updated.id, updated);
        return reply.code(201).send(item);
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.delete(
    '/collections/:id/items/:itemId',
    async (req: FastifyRequest<{ Params: { id: string; itemId: string } }>, reply) => {
      try {
        requireAuth(req);
        const col = getCollection(req.params.id);
        if (!col.items.some((it) => it.id === req.params.itemId)) throw notFound('Collection item');
        const updated: Collection = {
          ...col,
          items: col.items.filter((it) => it.id !== req.params.itemId),
          updatedAt: nowIso(),
        };
        store.collections.set(updated.id, updated);
        return reply.code(204).send();
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );
}
