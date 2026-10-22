import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { deckInputSchema, draftInputSchema, noteInputSchema, reviewInputSchema } from '../../../packages/shared/src/contracts';
import { openDatabase } from './db/database';
import { DemoContentProvider } from './providers/demo-content';
import type { ContentProvider } from './providers/content-provider';
import { manualDraft } from './providers/manual-content';
import { AppError, Library } from './services/library';

export function buildApp(options: {
  databasePath?: string; clock?: () => Date; provider?: ContentProvider;
  webRoot?: string; port?: number; logger?: boolean;
} = {}) {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 64 * 1024 });
  const db = openDatabase(options.databasePath ?? './data/lng-learn.sqlite');
  const library = new Library(db, options.clock);
  const provider = options.provider ?? new DemoContentProvider();
  const allowedOrigins = new Set([
    'http://localhost:5173', 'http://127.0.0.1:5173',
    `http://localhost:${options.port ?? 3001}`, `http://127.0.0.1:${options.port ?? 3001}`,
  ]);

  // 本機服務仍需阻止外站跨來源呼叫與 DNS rebinding；不開放萬用 CORS。
  app.addHook('onRequest', async (request) => {
    const hostname = request.hostname;
    if (!['localhost', '127.0.0.1'].includes(hostname))
      throw new AppError(403, 'HOST_FORBIDDEN', '僅接受本機主機名稱');
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin))
      throw new AppError(403, 'ORIGIN_FORBIDDEN', '不接受此來源的請求');
  });
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cache-Control', 'no-store');
    return payload;
  });
  app.addHook('onClose', async () => { db.close(); });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: '輸入格式不正確', details: error.issues.map(({ path, message }) => ({ path, message })) } });
    }
    if (error instanceof AppError) return reply.status(error.status).send({ error: { code: error.code, message: error.message } });
    const status = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
    if (typeof status === 'number' && status >= 400 && status < 500)
      return reply.status(status).send({ error: { code: 'BAD_REQUEST', message: '請求格式不正確或內容過大' } });
    request.log.error(error);
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: '伺服器發生錯誤' } });
  });

  app.get('/api/health', async () => ({ status: 'ok', contentProvider: provider.name }));
  app.get('/api/decks', async () => ({ decks: library.listDecks() }));
  app.post('/api/decks', async (request, reply) => reply.status(201).send(library.createDeck(deckInputSchema.parse(request.body))));
  app.post('/api/drafts', async (request) => {
    const input = draftInputSchema.parse(request.body);
    if (input.mode === 'manual') return manualDraft(input.word);
    if (input.mode === 'demo') return new DemoContentProvider().draft(input);
    return provider.draft(input);
  });
  app.get<{ Params: { deckId: string } }>('/api/decks/:deckId/notes', async (request) => ({ notes: library.listNotes(request.params.deckId) }));
  app.post<{ Params: { deckId: string } }>('/api/decks/:deckId/notes', async (request, reply) => {
    const input = noteInputSchema.parse(request.body);
    return reply.status(201).send(library.saveNote(request.params.deckId, input.content));
  });
  app.get<{ Params: { deckId: string } }>('/api/decks/:deckId/review', async (request) => library.queue(request.params.deckId));
  app.post<{ Params: { cardId: string } }>('/api/cards/:cardId/reviews', async (request) => library.review(request.params.cardId, reviewInputSchema.parse(request.body)));

  const webRoot = options.webRoot ?? resolve('dist/web');
  const hasWeb = existsSync(webRoot);
  if (hasWeb) {
    app.register(fastifyStatic, { root: webRoot });
  }
  app.setNotFoundHandler((request, reply) => {
    if (hasWeb && request.method === 'GET' && !request.url.split('?')[0].startsWith('/api') && request.headers.accept?.includes('text/html'))
      return reply.sendFile('index.html');
    return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '找不到此路徑' } });
  });
  return app;
}
