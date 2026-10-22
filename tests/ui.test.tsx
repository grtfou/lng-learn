// @vitest-environment happy-dom
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../apps/web/src/App';
import { Vocabulary } from '../apps/web/src/features/Vocabulary';
import { Study } from '../apps/web/src/features/Study';
import { api } from '../apps/web/src/api';
import type { Content, Deck, Note } from '../packages/shared/src/contracts';

vi.mock('../apps/web/src/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../apps/web/src/api')>(),
  api: { decks: vi.fn(), createDeck: vi.fn(), notes: vi.fn(), draft: vi.fn(), save: vi.fn(), queue: vi.fn(), review: vi.fn() },
}));
vi.mock('../apps/web/src/features/speech', () => ({
  browserSpeech: { available: () => false }, speak: vi.fn(),
}));

const deck: Deck = { id: 'deck', name: '英語', language: 'en-US', createdAt: '2026-10-22T00:00:00.000Z', total: 1, due: 1 };
const content: Content = {
  word: 'apple', meaning: '蘋果', ipa: '', example: '', exampleTranslation: '', phrases: [], story: '',
  sense: null, fieldSources: {}, image: null, audio: null, source: { kind: 'manual', provider: 'manual', url: null, license: null },
};
const note: Note = { id: 'note', deckId: deck.id, content, createdAt: deck.createdAt };
const card = { id: 'card', noteId: note.id, version: 0, dueAt: deck.createdAt, content };
const emptyQueue = { cards: [], nextDueAt: null };

beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);

it('單字庫建立成功即更新畫面，不因額外列表請求失敗而提示重建', async () => {
  vi.mocked(api.decks).mockResolvedValueOnce({ decks: [] }).mockRejectedValue(new Error('列表暫時無法讀取'));
  vi.mocked(api.createDeck).mockResolvedValue(deck);
  vi.mocked(api.notes).mockResolvedValue({ notes: [] });
  render(<App />);
  fireEvent.change(await screen.findByLabelText('單字庫名稱'), { target: { value: '英語' } });
  fireEvent.submit(screen.getByLabelText('單字庫名稱').closest('form')!);
  await screen.findByRole('heading', { name: '英語 EN → 繁中' });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(api.createDeck).toHaveBeenCalledTimes(1);
});

it('較早開始的單字列表請求不能覆蓋剛儲存的單字', async () => {
  let finishInitial!: (value: { notes: Note[] }) => void;
  vi.mocked(api.notes).mockReturnValue(new Promise((resolve) => { finishInitial = resolve; }));
  vi.mocked(api.draft).mockResolvedValue({ content, status: 'needs-input', notice: '手動填寫' });
  vi.mocked(api.save).mockResolvedValue(note);
  render(<Vocabulary deck={deck} onSaved={vi.fn().mockResolvedValue(undefined)} />);
  fireEvent.change(screen.getByLabelText('英文單字'), { target: { value: 'apple' } });
  fireEvent.click(screen.getByRole('button', { name: '產生預覽' }));
  fireEvent.click(await screen.findByRole('button', { name: '確認儲存，加入下一個' }));
  await screen.findByRole('heading', { name: 'apple' });
  await act(async () => { finishInitial({ notes: [] }); });
  expect(screen.getByRole('heading', { name: 'apple' })).toBeDefined();
  expect(document.activeElement).toBe(screen.getByLabelText('英文單字'));
});

it('StrictMode 較舊的單字庫列表回應不會移除剛建立的單字庫', async () => {
  let finishOld!: (value: { decks: Deck[] }) => void;
  vi.mocked(api.decks).mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve; }))
    .mockResolvedValueOnce({ decks: [] });
  vi.mocked(api.createDeck).mockResolvedValue(deck);
  vi.mocked(api.notes).mockResolvedValue({ notes: [] });
  render(<StrictMode><App /></StrictMode>);
  fireEvent.change(await screen.findByLabelText('單字庫名稱'), { target: { value: '英語' } });
  fireEvent.submit(screen.getByLabelText('單字庫名稱').closest('form')!);
  await screen.findByRole('heading', { name: '英語 EN → 繁中' });
  await act(async () => { finishOld({ decks: [] }); });
  expect(screen.getByRole('heading', { name: '英語 EN → 繁中' })).toBeDefined();
});

it('評分成功但取得下一張失敗時，重試沿用原 requestId 且只完成一次', async () => {
  vi.mocked(api.queue).mockResolvedValueOnce({ cards: [card], nextDueAt: null })
    .mockRejectedValueOnce(new Error('暫時離線')).mockResolvedValue(emptyQueue);
  vi.mocked(api.review).mockImplementation(async (_id, input) => ({
    requestId: input.requestId, cardId: card.id, version: 1, dueAt: '2026-10-23T00:00:00.000Z',
  }));
  const onReviewed = vi.fn().mockResolvedValue(undefined);
  render(<Study deck={deck} onReviewed={onReviewed} />);
  fireEvent.click(await screen.findByRole('button', { name: '顯示答案' }));
  fireEvent.click(screen.getByRole('button', { name: '記得 正常回想出正確答案' }));
  fireEvent.click(await screen.findByRole('button', { name: '重試同一筆評分' }));
  await screen.findByRole('heading', { name: '目前沒有到期的單字卡。' });
  expect(api.review).toHaveBeenCalledTimes(2);
  expect(vi.mocked(api.review).mock.calls[0]).toEqual(vi.mocked(api.review).mock.calls[1]);
  expect(onReviewed).toHaveBeenCalledTimes(1);
});

it('StrictMode 較舊的初始佇列回應不會覆蓋已評分後的新佇列', async () => {
  let finishOld!: (value: { cards: typeof card[]; nextDueAt: null }) => void;
  vi.mocked(api.queue).mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve; }))
    .mockResolvedValueOnce({ cards: [card], nextDueAt: null }).mockResolvedValue(emptyQueue);
  vi.mocked(api.review).mockImplementation(async (_id, input) => ({
    requestId: input.requestId, cardId: card.id, version: 1, dueAt: '2026-10-23T00:00:00.000Z',
  }));
  render(<StrictMode><Study deck={deck} onReviewed={vi.fn().mockResolvedValue(undefined)} /></StrictMode>);
  fireEvent.click(await screen.findByRole('button', { name: '顯示答案' }));
  fireEvent.click(screen.getByRole('button', { name: '記得 正常回想出正確答案' }));
  await screen.findByRole('heading', { name: '目前沒有到期的單字卡。' });
  await act(async () => { finishOld({ cards: [card], nextDueAt: null }); });
  await waitFor(() => { expect(screen.queryByRole('button', { name: '顯示答案' })).toBeNull(); });
});

const dictionarySource = {
  kind: 'retrieved' as const, provider: 'fixture', url: 'https://en.wiktionary.org/wiki/bank',
  author: null, license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  retrievedAt: '2026-10-22T00:00:00.000Z', model: null, promptVersion: null, userEdited: false, status: 'ready' as const,
};
const bankDraft = {
  status: 'dictionary' as const, notice: '請選義項並手動確認繁中釋義',
  content: { ...content, word: 'bank', meaning: '' },
  senses: [
    { key: 'finance', lemma: 'bank', partOfSpeech: 'noun', gloss: 'A financial institution.', accent: 'unspecified' as const,
      pronunciations: [], source: dictionarySource, example: 'I went to the bank.' },
    { key: 'river', lemma: 'bank', partOfSpeech: 'noun', gloss: 'The land beside a river.', accent: 'unspecified' as const,
      pronunciations: [], source: dictionarySource, example: 'We sat on the river bank.' },
  ],
};
async function previewBank() {
  vi.mocked(api.notes).mockResolvedValue({ notes: [] });
  vi.mocked(api.draft).mockResolvedValueOnce(structuredClone(bankDraft));
  render(<Vocabulary deck={deck} onSaved={vi.fn().mockResolvedValue(undefined)} />);
  fireEvent.change(screen.getByLabelText('英文單字'), { target: { value: 'bank' } });
  fireEvent.click(screen.getByRole('button', { name: '產生預覽' }));
  await screen.findByLabelText('詞義');
}

it('必須明確選義；切換義項保留人工修改，保存時帶正確義項與來源旗標', async () => {
  await previewBank();
  fireEvent.change(screen.getByLabelText('中文釋義（必填）'), { target: { value: '銀行' } });
  expect((screen.getByRole('button', { name: '確認儲存，加入下一個' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('詞義'), { target: { value: 'finance' } });
  fireEvent.change(screen.getByLabelText('例句', { exact: true }), { target: { value: 'My custom sentence.' } });
  fireEvent.change(screen.getByLabelText('詞義'), { target: { value: 'river' } });
  expect((screen.getByLabelText('例句', { exact: true }) as HTMLTextAreaElement).value).toBe('My custom sentence.');
  fireEvent.change(screen.getByLabelText('中文釋義（必填）'), { target: { value: '河岸' } });
  vi.mocked(api.save).mockImplementation(async (_deckId, saved) => ({ ...note, content: saved }));
  fireEvent.click(screen.getByRole('button', { name: '確認儲存，加入下一個' }));
  await screen.findByRole('heading', { name: 'bank' });
  expect(vi.mocked(api.save).mock.calls[0][1]).toMatchObject({ sense: { key: 'river' }, meaning: '河岸',
    fieldSources: { example: { kind: 'retrieved', userEdited: true }, meaning: { kind: 'manual', userEdited: true } } });
});

it.each(['TIMEOUT', 'RATE_LIMITED', 'INVALID_RESPONSE'] as const)('字典 %s 重試不清空釋義、例句或所選詞義', async (code) => {
  await previewBank();
  fireEvent.change(screen.getByLabelText('詞義'), { target: { value: 'finance' } });
  fireEvent.change(screen.getByLabelText('中文釋義（必填）'), { target: { value: '我的釋義' } });
  fireEvent.change(screen.getByLabelText('例句', { exact: true }), { target: { value: 'My example.' } });
  vi.mocked(api.draft).mockResolvedValueOnce({ ...bankDraft, senses: [], status: 'needs-input', issue: { code }, notice: '字典失敗，保留草稿' });
  fireEvent.click(screen.getByRole('button', { name: '產生預覽' }));
  await screen.findByRole('button', { name: '重新查詢字典' });
  expect((screen.getByLabelText('中文釋義（必填）') as HTMLInputElement).value).toBe('我的釋義');
  expect((screen.getByLabelText('例句', { exact: true }) as HTMLTextAreaElement).value).toBe('My example.');
  expect((screen.getByLabelText('詞義') as HTMLSelectElement).value).toBe('finance');
  vi.mocked(api.draft).mockRejectedValueOnce(new Error('連線中斷'));
  fireEvent.click(screen.getByRole('button', { name: '重新查詢字典' }));
  await screen.findByRole('alert');
  expect((screen.getByLabelText('中文釋義（必填）') as HTMLInputElement).value).toBe('我的釋義');
});

it('相同詞義衝突保留草稿，仍可選其他義項；修改詞形會清除舊義項', async () => {
  await previewBank();
  fireEvent.change(screen.getByLabelText('詞義'), { target: { value: 'finance' } });
  fireEvent.change(screen.getByLabelText('中文釋義（必填）'), { target: { value: '銀行' } });
  vi.mocked(api.save).mockRejectedValueOnce(new Error('這個單字的相同詞義已存在此單字庫'));
  fireEvent.click(screen.getByRole('button', { name: '確認儲存，加入下一個' }));
  await screen.findByRole('alert');
  expect((screen.getByLabelText('中文釋義（必填）') as HTMLInputElement).value).toBe('銀行');
  fireEvent.change(screen.getByLabelText('單字', { exact: true }), { target: { value: 'shore' } });
  expect(screen.queryByLabelText('詞義')).toBeNull();
  expect((screen.getByLabelText('英文單字') as HTMLInputElement).value).toBe('shore');
});
