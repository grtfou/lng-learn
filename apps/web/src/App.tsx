import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, BookOpen, Check, Layers, Leaf, Plus, Sprout } from 'lucide-react';
import type { Deck } from '../../../packages/shared/src/contracts';
import { api } from './api';
import { Vocabulary } from './features/Vocabulary';
import { Study } from './features/Study';
import { errorMessage } from './format';

export function App() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [view, setView] = useState<'library' | 'study'>('library');
  const [newDeck, setNewDeck] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const deckRequest = useRef(0);
  const load = useCallback(async () => {
    const request = ++deckRequest.current;
    try {
      const result = await api.decks();
      if (request !== deckRequest.current) return;
      setDecks(result.decks);
      setActive((current) => current ?? result.decks[0]?.id ?? null);
    } catch (error) { if (request === deckRequest.current) throw error; }
  }, []);
  useEffect(() => {
    let active = true;
    void load().catch((e) => { if (active) setError(errorMessage(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; deckRequest.current += 1; };
  }, [load]);
  const deck = decks.find((item) => item.id === active);
  const total = decks.reduce((sum, item) => sum + item.total, 0);
  const due = decks.reduce((sum, item) => sum + item.due, 0);
  async function createDeck(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const created = await api.createDeck(name);
      deckRequest.current += 1;
      setDecks((current) => [...current, created]);
      setActive(created.id); setName(''); setNewDeck(false); setView('library');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="拾語首頁"><span className="brand-icon"><Sprout size={25} /></span><span>拾語<small>WORDS THAT STAY</small></span></a>
      <div className="nav-label">我的學習空間</div>
      <button className={`nav-item ${view === 'library' ? 'active' : ''}`} onClick={() => setView('library')}><Layers size={19} /> 單字庫 <span>{decks.length}</span></button>
      <button className={`nav-item ${view === 'study' ? 'active' : ''}`} disabled={!deck} onClick={() => setView('study')}><BookOpen size={19} /> 開始複習</button>
      <div className="deck-heading"><span className="nav-label">我的單字庫</span><button className="icon-button" title="建立單字庫" aria-label="建立單字庫" onClick={() => { setNewDeck(true); setView('library'); }}><Plus size={17} /></button></div>
      <div className="deck-list">{decks.map((item) => <button key={item.id} className={`deck-nav ${active === item.id ? 'selected' : ''}`} onClick={() => { setActive(item.id); setView('library'); }}><span className="deck-dot" />{item.name}<small>{item.total}</small></button>)}</div>
      <div className="sidebar-note"><Leaf size={22} /><p>每天一點點，<br />讓語言長進生活裡。</p><span className="local-dot" /> 資料儲存於本機</div>
    </aside>
    <main>
      <header className="topbar"><span>我的學習空間 <span className="slash">/</span> {view === 'library' ? '單字庫' : '複習'}</span><span className="local-badge"><span className="local-dot" /> 本機模式</span></header>
      <div className="page-content">
        <div className="page-title"><div><p className="eyebrow">A LITTLE EVERY DAY</p><h1>{view === 'library' ? '把新單字，變成老朋友。' : '留一點時間，讓記憶生根。'}</h1><p className="muted">{view === 'library' ? '說出一個單字，從一次好奇開始你的語言旅程。' : '先試著回想，再看答案。誠實評分，找到適合自己的複習節奏。'}</p></div><span className="title-art" aria-hidden="true"><Sprout size={60} strokeWidth={1.1} /></span></div>
        {error && <div role="alert" className="notice error">{error}<button className="text-button" onClick={() => { setError(''); void load().catch((e) => setError(errorMessage(e))); }}>重新載入</button></div>}
        <div className="stats"><div><span>累積單字</span><strong>{total}<small> 個</small></strong></div><div><span>目前待複習</span><strong>{due}<small> 張</small></strong></div><div><span>學習方式</span><strong className="stat-text">回想 · 間隔複習</strong></div></div>
        {loading ? <p role="status">正在載入單字庫…</p> : <>
          {(newDeck || decks.length === 0) && <section className="panel create-deck"><div><span className="section-kicker">01 / 建立起點</span><h2>為你的單字取個家</h2><p className="muted">第一階段支援美式英語，使用繁體中文釋義。</p></div><form onSubmit={(event) => void createDeck(event)}><label htmlFor="deck-name">單字庫名稱</label><div className="input-row"><input id="deck-name" required maxLength={80} placeholder="例如：日常英語、旅行路上" value={name} onChange={(event) => setName(event.target.value)} disabled={busy} /><button className="primary" disabled={busy || !name.trim()}>{busy ? '建立中…' : '建立單字庫'}<ArrowRight size={17} /></button></div>{newDeck && decks.length > 0 && <button type="button" className="text-button" onClick={() => setNewDeck(false)}>取消</button>}</form></section>}
          {deck && <><div className="section-header"><div><span className="section-kicker">YOUR COLLECTION</span><h2>{deck.name}<span className="language-badge">EN → 繁中</span></h2></div><button className={view === 'library' ? 'primary' : 'secondary'} onClick={() => setView(view === 'library' ? 'study' : 'library')}>{view === 'library' ? <><BookOpen size={17} /> 開始複習 <span className="button-count">{deck.due}</span></> : '返回單字庫'}</button></div>
            {view === 'library' ? <Vocabulary key={deck.id} deck={deck} onSaved={load} /> : <Study key={deck.id} deck={deck} onReviewed={load} />}
          </>}
          {!deck && decks.length === 0 && <div className="onboarding"><div><span>1</span><h3>建立單字庫</h3><p>依照主題，整理想學的字。</p></div><div><span>2</span><h3>加入新單字</h3><p>口說或輸入，校閱內容後儲存。</p></div><div><span>3</span><h3>讓記憶留下來</h3><p>回想與複習，一次累積一點。</p></div></div>}
        </>}
        <footer><span><Check size={14} /> 你的進度，留在自己的電腦裡</span><span>架構預覽版 · 內容服務為示範模式</span></footer>
      </div>
    </main>
  </div>;
}
