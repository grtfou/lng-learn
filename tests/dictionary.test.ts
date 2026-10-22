import { afterEach, describe, expect, it, vi } from 'vitest';
import apple from './fixtures/dictionary-apple.json';
import bank from './fixtures/dictionary-bank.json';
import { FreeDictionaryProvider } from '../apps/server/src/providers/free-dictionary';
import { DictionaryContentProvider } from '../apps/server/src/providers/dictionary-content';
import { selectSense, editField } from '../packages/shared/src/provenance';

const now = new Date('2026-10-22T02:00:00.000Z');
const input = { word: 'APPLE', language: 'en-US' as const };
const response = (value: unknown, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
const provider = (value: unknown) => new FreeDictionaryProvider({ fetch: vi.fn<typeof fetch>().mockResolvedValue(response(value)), clock: () => now });
afterEach(() => vi.useRealTimers());

describe('正式字典轉接（只用固定 fixture，禁止呼叫正式服務）', () => {
  it('apple 的音標、來源、逐筆錄音授權與取得時間來自回應；不猜口音或錄音者', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(apple));
    const senses = await new FreeDictionaryProvider({ fetch: fetcher, clock: () => now }).lookup(input);
    expect(fetcher.mock.calls[0][0]).toBe('https://api.dictionaryapi.dev/api/v2/entries/en/apple');
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('error');
    expect(senses[0]).toMatchObject({ lemma: 'apple', partOfSpeech: 'noun', accent: 'unspecified',
      source: { kind: 'retrieved', url: 'https://en.wiktionary.org/wiki/apple', retrievedAt: now.toISOString(), author: null },
    });
    expect(senses[0].pronunciations[0]).toMatchObject({ ipa: '/ˈæp.əl/', recording: { speaker: 'unverified', source: { license: 'BY 3.0 US' } } });
    expect(senses[0].pronunciations[1].recording?.source.license).toBe('BY-SA 3.0');
  });
  it('bank 多義鍵穩定；重新排序不改變既有鍵', async () => {
    const first = await provider(bank).lookup({ ...input, word: 'bank' });
    const reordered = structuredClone(bank);
    reordered[0].meanings[0].definitions.reverse();
    const second = await provider(reordered).lookup({ ...input, word: 'bank' });
    expect(first).toHaveLength(2);
    expect(first[0].key).not.toBe(first[1].key);
    expect(first[0].key).toBe(second[1].key);
    expect(first[0].pronunciations).toEqual([]);
  });
  it('預覽不預選詞義或填造繁中翻譯，選詞後保留人工修改欄位', async () => {
    const draft = await new DictionaryContentProvider(provider(bank)).draft({ ...input, word: 'bank' });
    expect(draft.content.meaning).toBe(''); expect(draft.content.sense).toBeNull();
    let content = selectSense(draft.content, draft.senses![0]);
    content = editField(content, 'example', 'My own example.');
    content = editField(content, 'meaning', '銀行');
    content = selectSense(content, draft.senses![1]);
    expect(content.example).toBe('My own example.');
    expect(content.meaning).toBe('銀行');
    expect(content.fieldSources.example).toMatchObject({ userEdited: true, kind: 'retrieved' });
    expect(editField(content, 'word', 'shore').sense).toBeNull();
  });
  it.each([[], { title: 'No Definitions Found', message: 'No result' }])('查無資料可手動填寫', async (value) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(value, Array.isArray(value) ? 200 : 404));
    const draft = await new DictionaryContentProvider(new FreeDictionaryProvider({ fetch: fetcher })).draft(input);
    expect(draft).toMatchObject({ status: 'needs-input', issue: { code: 'NOT_FOUND' }, content: { ipa: '', meaning: '', sense: null } });
  });
  it('429 尊重 Retry-After，在期限前重試不再次呼叫來源', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({}, 429, { 'Retry-After': '120' }));
    const dict = new FreeDictionaryProvider({ fetch: fetcher, clock: () => now });
    for (let i = 0; i < 2; i++) await expect(dict.lookup(input)).rejects.toMatchObject({ issue: { code: 'RATE_LIMITED', retryAfterSeconds: 120 } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('429 支援 HTTP 日期 Retry-After', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({}, 429, { 'Retry-After': new Date(now.getTime() + 30_000).toUTCString() }));
    await expect(new FreeDictionaryProvider({ fetch: fetcher, clock: () => now }).lookup(input))
      .rejects.toMatchObject({ issue: { code: 'RATE_LIMITED', retryAfterSeconds: 30 } });
  });
  it('逾時中止且回傳可編輯空白稿', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')), { once: true });
    }));
    const pending = new DictionaryContentProvider(new FreeDictionaryProvider({ fetch: fetcher })).draft(input);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await pending).toMatchObject({ issue: { code: 'TIMEOUT' }, content: { word: 'apple', ipa: '' } });
  });
  it.each([
    () => new Response('broken json'),
    () => response([{ word: 'apple' }]),
    () => new Response('<html>404</html>', { status: 404 }),
    () => new Response('x'.repeat(256 * 1024 + 1)),
    () => { const bad = structuredClone(apple); bad[0].sourceUrls = ['javascript:alert(1)']; return response(bad); },
  ])('格式錯誤、過大或不安全來源回應不被當成字典資料', async (makeResponse) => {
    const dict = new FreeDictionaryProvider({ fetch: vi.fn<typeof fetch>().mockResolvedValue(makeResponse()) });
    expect(await new DictionaryContentProvider(dict).draft(input)).toMatchObject({ issue: { code: 'INVALID_RESPONSE' }, content: { ipa: '', meaning: '' } });
  });
  it('離線或 5xx 不阻擋手動路徑，不用 demo 冒充正式資料', async () => {
    for (const fetcher of [vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')), vi.fn<typeof fetch>().mockResolvedValue(response({}, 503))]) {
      expect(await new DictionaryContentProvider(new FreeDictionaryProvider({ fetch: fetcher })).draft(input))
        .toMatchObject({ status: 'needs-input', issue: { code: 'UNAVAILABLE' }, content: { meaning: '', ipa: '', source: { kind: 'manual' } } });
    }
  });
});
