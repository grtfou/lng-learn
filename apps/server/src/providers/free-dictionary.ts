import { createHash } from 'node:crypto';
import { z } from 'zod';
import { dictionarySenseSchema, httpsUrlSchema, normalizeWord, type DictionarySense, type FieldSource } from '../../../../packages/shared/src/contracts';
import { manualSource } from '../../../../packages/shared/src/provenance';
import { DictionaryError, type DictionaryProvider } from './dictionary-provider';

const licenseSchema = z.object({ name: z.string().min(1).max(200), url: httpsUrlSchema });
const entriesSchema = z.array(z.object({
  word: z.string().min(1).max(100), phonetic: z.string().max(200).optional(),
  phonetics: z.array(z.object({
    text: z.string().max(200).optional(), audio: z.union([httpsUrlSchema, z.literal('')]).optional(),
    sourceUrl: httpsUrlSchema.optional(), license: licenseSchema.optional(),
  })).max(20).default([]),
  meanings: z.array(z.object({
    partOfSpeech: z.string().min(1).max(100),
    definitions: z.array(z.object({ definition: z.string().min(1).max(2000), example: z.string().max(2000).optional() })).min(1).max(200),
  })).min(1).max(30),
  license: licenseSchema, sourceUrls: z.array(httpsUrlSchema).min(1).max(20),
})).min(1).max(20);

/** v2 無上游義項 ID：用詞形、詞性與原始釋義雜湊，避免結果排序改變時換鍵。 */
export class FreeDictionaryProvider implements DictionaryProvider {
  readonly name = 'free-dictionary';
  private rateLimitedUntil = 0;
  constructor(private options: { fetch?: typeof fetch; clock?: () => Date; timeoutMs?: number } = {}) {}

  async lookup({ word }: { word: string; language: 'en-US' }, signal?: AbortSignal): Promise<DictionarySense[]> {
    const now = this.options.clock?.() ?? new Date();
    if (now.getTime() < this.rateLimitedUntil)
      throw new DictionaryError({ code: 'RATE_LIMITED', retryAfterSeconds: Math.ceil((this.rateLimitedUntil - now.getTime()) / 1000) });
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), this.options.timeoutMs ?? 10_000);
    const combined = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
    try {
      const response = await (this.options.fetch ?? fetch)(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normalizeWord(word))}`, {
        signal: combined, redirect: 'error', headers: { Accept: 'application/json' },
      });
      if (response.status === 429) {
        const receivedAt = this.options.clock?.() ?? new Date();
        const raw = response.headers.get('retry-after');
        const seconds = raw && /^\d+$/.test(raw) ? Number(raw) : raw ? Math.ceil((Date.parse(raw) - receivedAt.getTime()) / 1000) : 60;
        const retryAfterSeconds = Number.isFinite(seconds) ? Math.max(1, seconds) : 60;
        this.rateLimitedUntil = receivedAt.getTime() + retryAfterSeconds * 1000;
        await response.body?.cancel();
        throw new DictionaryError({ code: 'RATE_LIMITED', retryAfterSeconds });
      }
      if (!response.ok && response.status !== 404) {
        await response.body?.cancel();
        throw new DictionaryError({ code: 'UNAVAILABLE' });
      }
      // 同時限制下載大小與讀取本文的時間；不跟隨外站重新導向。
      const reader = response.body?.getReader();
      if (!reader) throw new DictionaryError({ code: 'INVALID_RESPONSE' });
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 256 * 1024) throw new DictionaryError({ code: 'INVALID_RESPONSE' });
          chunks.push(part.value);
        }
      } finally { await reader.cancel(); }
      const json: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (response.status === 404) {
        z.object({ title: z.string(), message: z.string() }).parse(json);
        throw new DictionaryError({ code: 'NOT_FOUND' });
      }
      if (Array.isArray(json) && json.length === 0) throw new DictionaryError({ code: 'NOT_FOUND' });
      const entries = entriesSchema.parse(json);
      const senses = new Map<string, DictionarySense>();
      for (const entry of entries) {
        const source: FieldSource = { ...manualSource('ready'), kind: 'retrieved', provider: 'free-dictionary:v2',
          url: entry.sourceUrls[0], license: entry.license.name, licenseUrl: entry.license.url, retrievedAt: now.toISOString() };
        const pronunciations = entry.phonetics.map((item) => ({
          ipa: item.text ?? '', accent: 'unspecified' as const, source,
          recording: item.audio && item.sourceUrl && item.license ? {
            url: item.audio, speaker: 'unverified' as const,
            source: { ...source, url: item.sourceUrl, license: item.license.name, licenseUrl: item.license.url },
          } : null,
        }));
        if (!pronunciations.some((item) => item.ipa) && entry.phonetic)
          pronunciations.push({ ipa: entry.phonetic, accent: 'unspecified', source, recording: null });
        for (const meaning of entry.meanings) for (const definition of meaning.definitions) {
          const key = 'free-dictionary:' + createHash('sha256').update(JSON.stringify([
            normalizeWord(entry.word), meaning.partOfSpeech, definition.definition,
          ])).digest('hex');
          senses.set(key, dictionarySenseSchema.parse({ key, lemma: normalizeWord(entry.word), partOfSpeech: meaning.partOfSpeech,
            gloss: definition.definition, accent: 'unspecified', pronunciations, source, example: definition.example ?? '' }));
        }
      }
      return [...senses.values()];
    } catch (error) {
      if (error instanceof DictionaryError) throw error;
      if (timeout.signal.aborted) throw new DictionaryError({ code: 'TIMEOUT' });
      if (error instanceof z.ZodError || error instanceof SyntaxError) throw new DictionaryError({ code: 'INVALID_RESPONSE' });
      throw new DictionaryError({ code: 'UNAVAILABLE' });
    } finally { clearTimeout(timer); }
  }
}
