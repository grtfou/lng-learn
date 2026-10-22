import { buildApp } from './app';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT 必須是 1024–65535 的整數');
if (process.env.CONTENT_PROVIDER && process.env.CONTENT_PROVIDER !== 'demo')
  throw new Error('目前只實作 CONTENT_PROVIDER=demo；正式 provider 請依計畫書接入');

const app = buildApp({ databasePath: process.env.DATABASE_PATH, port, logger: true });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close(); });
}
try {
  await app.listen({ host: '127.0.0.1', port });
} catch (error) {
  app.log.error(error); await app.close(); process.exitCode = 1;
}
