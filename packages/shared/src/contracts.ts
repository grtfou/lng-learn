import { z } from 'zod';

export const languageSchema = z.literal('en-US'); // 首個垂直切片；多語言見計畫 P2。
export const deckInputSchema = z.object({
  name: z.string().trim().min(1).max(80), language: languageSchema.default('en-US'),
});
export const wordSchema = z.string().trim().min(1).max(100);
export const draftInputSchema = z.object({ word: wordSchema, language: languageSchema });
export const sourceSchema = z.object({
  kind: z.enum(['demo', 'manual', 'retrieved', 'generated']),
  provider: z.string().max(100), url: z.url().nullable(), license: z.string().max(200).nullable(),
});
export const assetSchema = z.object({
  url: z.url().refine((url) => new URL(url).protocol === 'https:', '素材必須使用 HTTPS'),
  attribution: z.string().max(500), license: z.string().max(200),
  kind: z.enum(['image', 'human-audio', 'synthetic-audio']),
});
export const contentSchema = z.object({
  word: wordSchema, ipa: z.string().trim().max(200),
  meaning: z.string().trim().max(2000),
  example: z.string().trim().max(2000), exampleTranslation: z.string().trim().max(2000),
  phrases: z.array(z.string().trim().max(300)).max(10),
  story: z.string().trim().max(4000),
  image: assetSchema.nullable(), audio: assetSchema.nullable(),
  source: sourceSchema,
});
export const noteInputSchema = z.object({
  content: contentSchema.refine((content) => content.meaning.length > 0, '請先填寫中文釋義'),
});
export const ratingSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export const reviewInputSchema = z.object({
  requestId: z.uuid(), rating: ratingSchema, version: z.number().int().nonnegative(),
});

export type Content = z.infer<typeof contentSchema>;
export type Rating = z.infer<typeof ratingSchema>;
export type Deck = { id: string; name: string; language: 'en-US'; createdAt: string; total: number; due: number };
export type Note = { id: string; deckId: string; content: Content; createdAt: string };
export type Draft = { content: Content; status: 'demo' | 'needs-input'; notice: string };
export type ReviewCard = {
  id: string; noteId: string; version: number; dueAt: string; content: Content;
};
export type ReviewResult = { requestId: string; cardId: string; dueAt: string; version: number };
export const ratings: { value: Rating; label: string; hint: string }[] = [
  { value: 1, label: '忘了', hint: '無法回想，或回答錯誤' },
  { value: 2, label: '困難', hint: '回想正確，但很吃力' },
  { value: 3, label: '記得', hint: '正常回想出正確答案' },
  { value: 4, label: '熟記', hint: '輕鬆而立即答對' },
];

export function normalizeWord(word: string): string {
  return word.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

/** 只接受明確的英文字母序列；含歧義的口語名稱交由使用者校正。 */
export function parseSpelling(transcript: string): string | null {
  const letters = transcript.trim().split(/[\s,，.。-]+/).filter(Boolean);
  return letters.length > 0 && letters.every((letter) => /^[a-z]$/i.test(letter))
    ? letters.join('').toLowerCase() : null;
}
