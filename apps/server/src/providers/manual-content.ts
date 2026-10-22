import { normalizeWord, type Draft } from '../../../../packages/shared/src/contracts';
import { completeSources } from '../../../../packages/shared/src/provenance';

export function manualDraft(word: string): Draft {
  return { status: 'needs-input', notice: '手動建卡不查詢網路。請填寫已確認的繁中釋義，缺漏音標可留白。', senses: [],
    content: completeSources({ word: normalizeWord(word), ipa: '', meaning: '', example: '', exampleTranslation: '', phrases: [], story: '',
      sense: null, fieldSources: {}, image: null, audio: null,
      source: { kind: 'manual', provider: 'manual', url: null, license: null } }),
  };
}
