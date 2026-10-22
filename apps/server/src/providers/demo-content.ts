import type { ContentProvider } from './content-provider';
import type { Content } from '../../../../packages/shared/src/contracts';
import { normalizeWord } from '../../../../packages/shared/src/contracts';

const lexicon: Partial<Record<string, Pick<Content, 'ipa' | 'meaning' | 'example' | 'exampleTranslation' | 'phrases' | 'story'>>> = {
  apple: {
    ipa: '/ˈæp.əl/', meaning: '蘋果（名詞）',
    example: 'She packed an apple for the journey.', exampleTranslation: '她為旅途帶了一顆蘋果。',
    phrases: ['an apple a day', 'apple pie'],
    story: 'Mia put a red apple in her bag. On the train, she shared it with a new friend.',
  },
  journey: {
    ipa: '/ˈdʒɝː.ni/', meaning: '旅程；旅行（名詞）',
    example: 'Every journey begins with a single step.', exampleTranslation: '每一段旅程都從一步開始。',
    phrases: ['a long journey', 'begin a journey'],
    story: 'Leo began a journey with a small map. Each day, he learned a new word and found a new place.',
  },
  curious: {
    ipa: '/ˈkjʊr.i.əs/', meaning: '好奇的；求知慾強的（形容詞）',
    example: 'The curious child asked another question.', exampleTranslation: '好奇的孩子又問了一個問題。',
    phrases: ['curious about', 'a curious mind'],
    story: 'A curious fox saw a light in the forest. It followed the light and found a quiet little house.',
  },
};

export class DemoContentProvider implements ContentProvider {
  readonly name = 'demo';
  async draft({ word }: { word: string; language: 'en-US' }) {
    const normalized = normalizeWord(word);
    const fixture = Object.hasOwn(lexicon, normalized) ? lexicon[normalized] : undefined;
    return {
      status: fixture ? 'demo' as const : 'needs-input' as const,
      notice: fixture
        ? '這是內建示範內容，並非即時網路查詢。圖片與真人音檔尚未串接。請校閱後儲存。'
        : '此單字沒有示範資料。請手動填寫釋義；正式字典與內容生成服務將於後續實作。',
      content: {
        word: normalized, ipa: '', meaning: '', example: '', exampleTranslation: '', phrases: [], story: '',
        ...fixture, image: null, audio: null,
        source: { kind: fixture ? 'demo' as const : 'manual' as const, provider: 'demo', url: null, license: null },
      },
    };
  }
}
