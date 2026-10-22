import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../apps/server/src/app';
import { parseSpelling } from '../packages/shared/src/contracts';

describe('HTTP 契約', () => {
  let app: ReturnType<typeof buildApp>;
  beforeEach(() => { app = buildApp({ databasePath: ':memory:', webRoot: '/nonexistent' }); });
  afterEach(() => app.close());

  it('不需 API key 即可啟動，初始資料為空', async () => {
    expect((await app.inject('/api/health')).json()).toEqual({ status: 'ok', contentProvider: 'demo' });
    expect((await app.inject('/api/decks')).json()).toEqual({ decks: [] });
  });
  it('驗證空白名稱、不支援語言與錯誤評分', async () => {
    for (const payload of [{ name: '  ' }, { name: '日文', language: 'ja-JP' }]) {
      const response = await app.inject({ method: 'POST', url: '/api/decks', payload });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    }
    const response = await app.inject({ method: 'POST', url: '/api/cards/missing/reviews', payload: { rating: 0 } });
    expect(response.statusCode).toBe(400);
  });
  it('示範單字與未知單字明確區別，沒有虛構網路來源', async () => {
    const apple = (await app.inject({ method: 'POST', url: '/api/drafts', payload: { word: 'APPLE', language: 'en-US' } })).json();
    expect(apple.status).toBe('demo'); expect(apple.content.image).toBeNull();
    const unknown = (await app.inject({ method: 'POST', url: '/api/drafts', payload: { word: 'unknownword', language: 'en-US' } })).json();
    expect(unknown.status).toBe('needs-input'); expect(unknown.content.meaning).toBe('');
    expect(unknown.content.source.url).toBeNull();
  });
  it('完整 API 流程：預覽、儲存、評分；重試保留同一個結果', async () => {
    const deck = (await app.inject({ method: 'POST', url: '/api/decks', payload: { name: '英語' } })).json();
    const draft = (await app.inject({ method: 'POST', url: '/api/drafts', payload: { word: 'journey', language: 'en-US' } })).json();
    const save = await app.inject({ method: 'POST', url: `/api/decks/${deck.id}/notes`, payload: { content: draft.content } });
    expect(save.statusCode).toBe(201);
    const duplicate = await app.inject({ method: 'POST', url: `/api/decks/${deck.id}/notes`, payload: { content: draft.content } });
    expect(duplicate.statusCode).toBe(409);
    const card = (await app.inject(`/api/decks/${deck.id}/review`)).json().cards[0];
    const request = { method: 'POST' as const, url: `/api/cards/${card.id}/reviews`, payload: { requestId: '263ed764-765d-4d26-8076-9fc30e7b914e', version: card.version, rating: 3 } };
    const result = await app.inject(request);
    expect(result.statusCode).toBe(200);
    expect((await app.inject(request)).json()).toEqual(result.json());
    expect((await app.inject(`/api/decks/${deck.id}/review`)).json().cards).toHaveLength(0);
  });
  it.each(['constructor', '__proto__', 'toString'])('物件內建屬性 %s 不能被當作示範字典內容', async (word) => {
    const response = await app.inject({ method: 'POST', url: '/api/drafts', payload: { word, language: 'en-US' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'needs-input', content: { meaning: '', source: { kind: 'manual' } },
    });
  });
  it('不存在的單字庫回傳 404；空白釋義不能儲存', async () => {
    expect((await app.inject('/api/decks/missing/review')).statusCode).toBe(404);
    const draft = (await app.inject({ method: 'POST', url: '/api/drafts', payload: { word: 'x', language: 'en-US' } })).json();
    expect((await app.inject({ method: 'POST', url: '/api/decks/missing/notes', payload: { content: draft.content } })).statusCode).toBe(400);
  });
  it('拒絕外站來源、偽裝本機的 host 及超大輸入', async () => {
    expect((await app.inject({ url: '/api/decks', headers: { origin: 'https://evil.example' } })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/decks', headers: { host: 'evil.example' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/drafts', payload: { word: 'x'.repeat(70000), language: 'en-US' } })).statusCode).toBe(413);
  });
});

it('磁碟資料與排程在重開伺服器後保留；migration 不會重複執行', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'lng-learn-test-'));
  const databasePath = join(directory, 'test.sqlite');
  const first = buildApp({ databasePath, webRoot: '/nonexistent' });
  let second: ReturnType<typeof buildApp> | undefined;
  try {
    const deck = (await first.inject({ method: 'POST', url: '/api/decks', payload: { name: '持久化' } })).json();
    const draft = (await first.inject({ method: 'POST', url: '/api/drafts', payload: { word: 'apple', language: 'en-US' } })).json();
    await first.inject({ method: 'POST', url: `/api/decks/${deck.id}/notes`, payload: { content: draft.content } });
    const card = (await first.inject(`/api/decks/${deck.id}/review`)).json().cards[0];
    const result = (await first.inject({ method: 'POST', url: `/api/cards/${card.id}/reviews`, payload: { requestId: '263ed764-765d-4d26-8076-9fc30e7b914f', rating: 4, version: 0 } })).json();
    await first.close();
    second = buildApp({ databasePath, webRoot: '/nonexistent' });
    expect((await second.inject('/api/decks')).json().decks[0]).toMatchObject({ id: deck.id, total: 1, due: 0 });
    expect((await second.inject(`/api/decks/${deck.id}/review`)).json().nextDueAt).toBe(result.dueAt);
    expect((await second.inject(`/api/decks/${deck.id}/notes`)).json().notes[0].content.word).toBe('apple');
  } finally { await first.close(); await second?.close(); rmSync(directory, { recursive: true, force: true }); }
});

it('逐字母拼讀僅處理明確的拉丁字母，歧義留待使用者確認', () => {
  expect(parseSpelling('A P P L E')).toBe('apple');
  expect(parseSpelling('a, p, p, l, e.')).toBe('apple');
  expect(parseSpelling('double u')).toBeNull();
  expect(parseSpelling('apple')).toBeNull();
  expect(parseSpelling('')).toBeNull();
});
