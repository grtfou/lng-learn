import { parseSpelling } from '../../../../packages/shared/src/contracts';

type RecognitionEvent = { results: { [index: number]: { [index: number]: { transcript: string } } } };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null; start(): void; abort(): void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export interface SpeechInput {
  available(): boolean;
  listen(mode: 'word' | 'spelling', onResult: (text: string) => void, onError: (message: string) => void, onEnd: () => void): () => void;
}
export const browserSpeech: SpeechInput = {
  available: () => Boolean((window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition),
  listen(mode, onResult, onError, onEnd) {
    const Constructor = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
    if (!Constructor) { onError('此瀏覽器不支援語音辨識，請使用文字輸入。'); onEnd(); return () => {}; }
    const recognition = new Constructor();
    recognition.lang = 'en-US'; recognition.continuous = false; recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const text = mode === 'spelling' ? parseSpelling(transcript) : transcript.trim();
      if (text) onResult(text);
      else onError(`無法確認逐字拼讀「${transcript}」，請重新說一次或手動修正。`);
    };
    recognition.onerror = ({ error }) => onError(error === 'not-allowed' ? '麥克風權限未開啟，仍可使用文字輸入。' : `辨識未完成（${error}），請重試或使用文字輸入。`);
    recognition.onend = onEnd;
    try { recognition.start(); } catch { onError('無法啟動語音辨識，請使用文字輸入。'); onEnd(); }
    return () => { recognition.onresult = null; recognition.onerror = null; recognition.onend = null; recognition.abort(); };
  },
};

export function speak(word: string, onError: (message: string) => void) {
  if (!('speechSynthesis' in window)) { onError('此瀏覽器不支援合成語音。'); return; }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  const voices = speechSynthesis.getVoices();
  utterance.voice = voices.find((voice) => voice.lang === 'en-US' && voice.localService)
    ?? voices.find((voice) => voice.lang === 'en-US') ?? null;
  utterance.onerror = (event) => { if (event.error !== 'canceled' && event.error !== 'interrupted') onError('語音播放失敗，請確認系統已安裝英語語音。'); };
  speechSynthesis.speak(utterance);
}
