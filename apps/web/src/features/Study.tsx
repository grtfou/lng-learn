import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Eye, Sprout, Volume2 } from 'lucide-react';
import type { Deck, Rating, ReviewCard } from '../../../../packages/shared/src/contracts';
import { ratings } from '../../../../packages/shared/src/contracts';
import { api, ApiError } from '../api';
import { dateTime, errorMessage } from '../format';
import { speak } from './speech';

type Attempt = { requestId: string; cardId: string; rating: Rating; version: number };
export function Study({ deck, onReviewed }: { deck: Deck; onReviewed: () => Promise<void> }) {
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(0);
  const [lastDue, setLastDue] = useState('');
  const attempt = useRef<Attempt | null>(null);
  const queueRequest = useRef(0);
  const [retry, setRetry] = useState(false);
  const current = cards[0];
  const load = useCallback(async () => {
    const request = ++queueRequest.current;
    const queue = await api.queue(deck.id);
    if (request !== queueRequest.current) return;
    setCards(queue.cards); setNextDue(queue.nextDueAt); setRevealed(false); setLoaded(true);
  }, [deck.id]);
  useEffect(() => {
    let active = true;
    void load().catch((e) => { if (active) setError(errorMessage(e)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; queueRequest.current += 1; };
  }, [load]);
  async function rate(rating: Rating) {
    if (!current || !revealed || busy) return;
    const input = attempt.current ?? { requestId: crypto.randomUUID(), cardId: current.id, rating, version: current.version };
    attempt.current = input; setRetry(true); setBusy(true); setError('');
    try {
      const result = await api.review(input.cardId, input);
      await load();
      attempt.current = null; setRetry(false); setCompleted((value) => value + 1); setLastDue(result.dueAt);
      await onReviewed();
    } catch (e) {
      if (e instanceof ApiError && ['STALE_CARD', 'CARD_NOT_DUE'].includes(e.code)) {
        attempt.current = null; setRetry(false);
        try { await load(); } catch { setLoaded(false); }
      }
      setError(errorMessage(e));
    } finally { setBusy(false); }
  }
  async function refresh() {
    setBusy(true); setError('');
    try { await load(); await onReviewed(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <section className="study-area">
    <div className="study-status"><span>本次已完成 <strong>{completed}</strong> 張</span><span>{cards.length > 0 ? `目前佇列 ${cards.length} 張（每批最多 100 張）` : '依到期時間安排複習'}</span></div>
    {lastDue && <p className="notice success" role="status">評分已儲存，上張卡下次複習：{dateTime(lastDue)}</p>}
    {error && <div role="alert" className="notice error">{error}{retry && attempt.current ? <button className="secondary" disabled={busy} onClick={() => void rate(attempt.current!.rating)}>重試同一筆評分</button> : <button className="text-button" disabled={busy} onClick={() => void refresh()}>重新載入</button>}</div>}
    {!loaded && busy ? <p role="status">正在取得複習卡…</p> : current ? <>
      <article className="study-card"><p className="eyebrow">{revealed ? 'ANSWER / 看看記得多少' : 'RECALL / 先試著回想'}</p><h2 lang="en">{current.content.word}</h2>
        {!revealed ? <><p className="muted">想一想它的意思，也試著說出一個例句。</p><button className="primary reveal" disabled={busy} onClick={() => setRevealed(true)}><Eye size={18} /> 顯示答案</button></> : <div className="card-answer"><span className="ipa">{current.content.ipa}</span><p className="meaning">{current.content.meaning}</p><button className="secondary" onClick={() => speak(current.content.word, setError)}><Volume2 size={17} /> 合成語音</button><p className="helper">可能使用線上服務，非真人錄音</p><div className="answer-details">{current.content.example && <div><span className="section-kicker">例句</span><p lang="en">{current.content.example}</p><p className="muted">{current.content.exampleTranslation}</p></div>}{current.content.phrases.filter(Boolean).length > 0 && <div><span className="section-kicker">常用片語</span><p lang="en">{current.content.phrases.filter(Boolean).join(' · ')}</p></div>}{current.content.story && <div><span className="section-kicker">小故事</span><p lang="en">{current.content.story}</p></div>}<p className="helper">{current.content.source.kind === 'demo' ? '來源：內建示範，經使用者校閱。' : '來源：使用者手動建立。'} 圖片與真人音檔待串接。</p></div></div>}
      </article>
      {revealed && <div className="rating-area"><p>這次回想的感覺如何？忘記或答錯時，請選「忘了」。</p><div className="rating-buttons">{ratings.map(({ value, label, hint }) => <button key={value} className={`rating rating-${value}`} title={hint} disabled={busy || retry} onClick={() => void rate(value)}><strong>{label}</strong><span>{hint}</span></button>)}</div></div>}
    </> : loaded && <div className="empty-state study-empty">{deck.total ? <CheckCircle2 size={42} strokeWidth={1.3} /> : <Sprout size={42} strokeWidth={1.3} />}<h2>{deck.total ? '目前沒有到期的單字卡。' : '這個單字庫還沒有單字。'}</h2><p>{nextDue ? `下次複習時間：${dateTime(nextDue)}` : '回到單字庫，加入第一個想學的單字。'}</p><button className="secondary" disabled={busy} onClick={() => void refresh()}>檢查到期單字</button></div>}
  </section>;
}
