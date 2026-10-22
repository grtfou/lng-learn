import { afterEach, expect, it, vi } from 'vitest';
import { buildApp } from '../apps/server/src/app';
import { DictionaryContentProvider } from '../apps/server/src/providers/dictionary-content';
import { FreeDictionaryProvider } from '../apps/server/src/providers/free-dictionary';
import { configuredProvider } from '../apps/server/src/providers/configured-provider';
import { editField, selectSense } from '../packages/shared/src/provenance';
import type { Draft } from '../packages/shared/src/contracts';
import bank from './fixtures/dictionary-bank.json';

const fetcher = vi.fn<typeof fetch>();
const app = () => buildApp({ databasePath: ':memory:', webRoot: '/nonexistent', provider: new DictionaryContentProvider(new FreeDictionaryProvider({ fetch: fetcher })) });
const apps: ReturnType<typeof app>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((a) => a.close())); vi.restoreAllMocks(); vi.resetAllMocks(); });

it('正式字典義項 → 人工繁中釋義 → 保存兩義 → 重複衝突，逐欄來源隨佇列回傳', async () => {
  fetcher.mockResolvedValue(new Response(JSON.stringify(bank)));
  const a = app(); apps.push(a);
  expect((await a.inject('/api/health')).json().contentProvider).toBe('free-dictionary');
  const deck = (await a.inject({ method: 'POST', url: '/api/decks', payload: { name: '詞義' } })).json();
  const draft: Draft = (await a.inject({ method: 'POST', url: '/api/drafts', payload: { word: 'bank', language: 'en-US' } })).json();
  expect((await a.inject(`/api/decks/${deck.id}/notes`)).json().notes).toEqual([]);
  for (const [index, meaning] of ['銀行', '河岸'].entries()) {
    const content = editField(selectSense(draft.content, draft.senses![index]), 'meaning', meaning);
    const save = { method: 'POST' as const, url: `/api/decks/${deck.id}/notes`, payload: { content } };
    expect((await a.inject(save)).statusCode).toBe(201);
    expect((await a.inject(save)).statusCode).toBe(409);
  }
  const cards = (await a.inject(`/api/decks/${deck.id}/review`)).json().cards;
  expect(cards).toHaveLength(2);
  expect(cards[0].content.fieldSources.sense.kind).toBe('retrieved');
  expect(cards[0].content.fieldSources.meaning.userEdited).toBe(true);
  const mismatch = editField(selectSense(draft.content, draft.senses![0]), 'meaning', '銀行');
  expect((await a.inject({ method: 'POST', url: `/api/decks/${deck.id}/notes`, payload: { content: { ...mismatch, word: 'shore' } } })).statusCode).toBe(400);
});

it('正式來源失敗仍可手動保存；手動和 demo 路徑完全不呼叫外部來源', async () => {
  fetcher.mockRejectedValue(new Error('offline'));
  const a = app(); apps.push(a);
  const deck = (await a.inject({ method: 'POST', url: '/api/decks', payload: { name: '離線' } })).json();
  const failed: Draft = (await a.inject({ method: 'POST', url: '/api/drafts', payload: { word: 'nonesuch', language: 'en-US' } })).json();
  expect(failed.issue?.code).toBe('UNAVAILABLE');
  expect((await a.inject({ method: 'POST', url: `/api/decks/${deck.id}/notes`, payload: { content: editField(failed.content, 'meaning', '手動釋義') } })).statusCode).toBe(201);
  fetcher.mockClear();
  for (const mode of ['manual', 'demo']) {
    const response = await a.inject({ method: 'POST', url: '/api/drafts', payload: { word: 'apple', language: 'en-US', mode } });
    expect(response.statusCode).toBe(200);
    expect(response.json().content.source.kind).toBe(mode);
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it('預設即時字典，可明確切回 demo，錯誤模式拒絕啟動', () => {
  expect(configuredProvider().name).toBe('free-dictionary');
  expect(configuredProvider('demo').name).toBe('demo');
  expect(configuredProvider('free-dictionary').name).toBe('free-dictionary');
  expect(() => configuredProvider('paid')).toThrow('CONTENT_PROVIDER');
});

it('啟動與讀取本機資料不預抓字典；只有輸入正式查詢時才連網', async () => {
  const network = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(bank)));
  const a = buildApp({ databasePath: ':memory:', webRoot: '/nonexistent' }); apps.push(a);
  expect((await a.inject('/api/health')).json().contentProvider).toBe('free-dictionary');
  await a.inject('/api/decks');
  for (const mode of ['manual', 'demo'])
    await a.inject({ method: 'POST', url: '/api/drafts', payload: { word: 'apple', language: 'en-US', mode } });
  expect(network).not.toHaveBeenCalled();
  const response = await a.inject({ method: 'POST', url: '/api/drafts', payload: { word: 'bank', language: 'en-US' } });
  expect(response.json().status).toBe('dictionary');
  expect(network).toHaveBeenCalledTimes(1);
});
