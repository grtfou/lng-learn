import type { Draft } from '../../../../packages/shared/src/contracts';
import { DictionaryError, type DictionaryProvider } from './dictionary-provider';
import { DemoContentProvider } from './demo-content';
import type { ContentProvider } from './content-provider';

export class DictionaryContentProvider implements ContentProvider {
  readonly name: string;
  constructor(private dictionary: DictionaryProvider) { this.name = dictionary.name; }
  async draft(input: { word: string; language: 'en-US' }, signal?: AbortSignal): Promise<Draft> {
    // 手動空白稿，不以示範內容冒充正式字典查詢結果。
    const fallback = await new DemoContentProvider().draft({ ...input, word: input.word });
    const content = { ...fallback.content, ipa: '', meaning: '', example: '', exampleTranslation: '', phrases: [], story: '',
      source: { kind: 'manual' as const, provider: 'manual', url: null, license: null }, fieldSources: {} };
    try {
      const senses = await this.dictionary.lookup(input, signal);
      if (!senses.length) throw new DictionaryError({ code: 'NOT_FOUND' });
      return { content, senses, status: 'dictionary', notice: '請先選擇一個英文義項，再填寫確認過的繁中釋義。字典未驗證錄音者或口音；錄音目前僅保存 metadata。' };
    } catch (error) {
      const issue = error instanceof DictionaryError ? error.issue : { code: 'UNAVAILABLE' as const };
      const messages = { NOT_FOUND: '字典查無此詞', RATE_LIMITED: '字典暫時限流', TIMEOUT: '字典查詢逾時', INVALID_RESPONSE: '字典回應格式錯誤', UNAVAILABLE: '字典暫時無法使用' };
      return { content, senses: [], status: 'needs-input', issue,
        notice: `${messages[issue.code]}。可重試或手動填寫，已編輯的草稿會保留。${issue.retryAfterSeconds ? `請於 ${issue.retryAfterSeconds} 秒後重試。` : ''}` };
    }
  }
}
