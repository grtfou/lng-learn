import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Image, Mic, Sprout, Square, Volume2 } from 'lucide-react';
import { normalizeWord, type ContentField, type Deck, type Draft, type Note } from '../../../../packages/shared/src/contracts';
import { editField, preserveEditedFields, selectSense } from '../../../../packages/shared/src/provenance';
import { api } from '../api';
import { errorMessage } from '../format';
import { browserSpeech, speak } from './speech';
import { FieldSources } from './FieldSources';

export function Vocabulary({ deck, onSaved }: { deck: Deck; onSaved: () => Promise<void> }) {
  const [word, setWord] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftMode, setDraftMode] = useState<'configured' | 'demo' | 'manual'>('configured');
  const [draftOrigin, setDraftOrigin] = useState<{ word: string; mode: typeof draftMode } | null>(null);
  const [senseChoice, setSenseChoice] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [listening, setListening] = useState(false);
  const [consent, setConsent] = useState(false);
  const [mode, setMode] = useState<'word' | 'spelling'>('word');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const stop = useRef<(() => void) | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const focusAfterSave = useRef(false);
  useEffect(() => {
    if (!busy && focusAfterSave.current) {
      input.current?.focus(); focusAfterSave.current = false;
    }
  }, [busy]);
  useEffect(() => {
    let active = true;
    api.notes(deck.id).then(({ notes: list }) => {
      if (active) setNotes((current) => {
        // 初始查詢較晚回來時，保留這段期間已儲存的新單字。
        const existing = new Set(current.map((note) => note.id));
        return [...current, ...list.filter((note) => !existing.has(note.id))];
      });
    }).catch((e) => { if (active) setError(errorMessage(e)); });
    return () => { active = false; stop.current?.(); };
  }, [deck.id]);
  function listen() {
    if (listening) { stop.current?.(); setListening(false); return; }
    setError(''); setStatus(''); setListening(true);
    stop.current = browserSpeech.listen(mode, (text) => { setWord(text); setDraft(null); setStatus('辨識完成，請確認文字後產生預覽。'); }, setError, () => setListening(false));
  }
  async function preview(event?: FormEvent) {
    event?.preventDefault(); stop.current?.(); setListening(false); setBusy(true); setPreviewing(true); setError(''); setStatus('');
    try {
      const next = await api.draft(word, draftMode);
      if (draft && draftOrigin?.word === normalizeWord(word) && draftOrigin.mode === draftMode) {
        setDraft({ ...next, content: draft.content, senses: next.issue ? draft.senses : next.senses });
      } else {
        const content = draft && normalizeWord(draft.content.word) === normalizeWord(next.content.word)
          ? preserveEditedFields(draft.content, next.content) : next.content;
        setDraft({ ...next, content }); setSenseChoice('');
      }
      setDraftOrigin({ word: normalizeWord(word), mode: draftMode });
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); setPreviewing(false); }
  }
  function update(key: ContentField, value: string | string[]) {
    if (key === 'word') { setWord(String(value)); setSenseChoice(''); }
    setDraft((current) => current ? { ...current, content: editField(current.content, key, value),
      ...(key === 'word' && normalizeWord(String(value)) !== normalizeWord(current.content.word)
        ? { status: 'needs-input', senses: [], notice: '單字已修改，已清除舊義項與未修改的自動內容；保留人工文字供校閱。請重新查詢或以手動義項儲存。', issue: undefined } : {}),
    } : current);
  }
  function chooseSense(key: string) {
    setSenseChoice(key);
    setDraft((current) => current?.content.sense?.key === key ? current : current ? { ...current,
      content: selectSense(current.content, current.senses?.find((sense) => sense.key === key) ?? null),
    } : current);
  }
  async function save() {
    if (!draft) return;
    setBusy(true); setError('');
    try {
      const note = await api.save(deck.id, draft.content);
      focusAfterSave.current = true;
      setNotes((current) => [note, ...current]); setDraft(null); setWord(''); setStatus(`已儲存「${note.content.word}」，可以加入下一個單字。`);
      await onSaved();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  const content = draft?.content;
  const retainedSense = content?.sense && !draft?.senses?.some((sense) => sense.key === content.sense?.key) ? content.sense : null;
  const needsSenseChoice = Boolean(draft?.senses?.length && !senseChoice && !content?.sense);
  return <>
    <section className="panel vocabulary-panel" aria-busy={busy}>
      <div className="panel-intro"><span className="section-kicker">ADD A LITTLE CURIOSITY</span><h2>今天，想認識哪個單字？</h2><p className="muted">試試 <button className="inline-word" lang="en" disabled={busy || listening} onClick={() => { setWord('journey'); setDraft(null); }}>journey</button>、apple 或 curious 的示範；正式字典模式可查詢英文義項，繁中釋義由你確認填寫。</p></div>
      <form onSubmit={(event) => void preview(event)}>
        <label className="provider-choice">內容來源<select value={draftMode} disabled={busy || listening} onChange={(event) => setDraftMode(event.target.value as typeof draftMode)}><option value="configured">依伺服器設定（預設為示範）</option><option value="demo">內建示範（不查詢網路）</option><option value="manual">直接手動建卡（不查詢網路）</option></select></label>
        <label htmlFor="word">英文單字</label><div className="input-row word-row"><input ref={input} id="word" lang="en" autoComplete="off" required maxLength={100} placeholder="輸入單字，或用語音說出來…" value={word} disabled={busy || listening} onChange={(event) => { setWord(event.target.value); setDraft(null); }} /><button type="button" className={`mic-button ${listening ? 'recording' : ''}`} aria-label={listening ? '停止辨識' : '開始語音辨識'} disabled={busy || !consent || !browserSpeech.available()} onClick={listen}>{listening ? <Square size={19} /> : <Mic size={21} />}</button><button className="primary" disabled={busy || listening || !word.trim()}>{busy ? '處理中…' : '產生預覽'}<ArrowRight size={16} /></button></div>
        <div className="speech-options"><label className="checkbox-label"><input type="checkbox" checked={consent} disabled={listening} onChange={(event) => setConsent(event.target.checked)} />允許瀏覽器辨識語音（可能傳送至線上服務）</label><label className="mode-label">輸入方式 <select aria-label="語音輸入方式" value={mode} disabled={listening} onChange={(event) => setMode(event.target.value as 'word' | 'spelling')}><option value="word">唸出單字</option><option value="spelling">逐字母拼讀</option></select></label></div>
        {!browserSpeech.available() && <p className="helper">此瀏覽器未提供語音辨識，請使用文字輸入。逐字母拼讀只接受 A P P L E 這類明確字母序列。</p>}
      </form>
      {error && <p role="alert" className="notice error">{error}</p>}
      {status && <p role="status" className="notice success"><Check size={16} />{status}</p>}
      {listening && <p role="status" className="notice">正在聆聽，請用英語{mode === 'spelling' ? '逐個字母拼讀' : '說出單字'}…</p>}
      {busy && <p role="status" className="helper">正在處理，請稍候…</p>}
      {draft && content && <div className="draft-editor">
        <div className="notice" role="status">{draft.notice}{draft.issue && <button className="text-button" disabled={busy} onClick={() => void preview()}>重新查詢字典</button>}</div>
        <div className="draft-heading"><h3>校閱單字卡</h3><span className="tag">{draft.status === 'demo' ? '內建示範' : content.sense ? '字典義項' : '待確認／手動填寫'}</span></div>
        {(!!draft.senses?.length || retainedSense) && <fieldset disabled={busy} className="sense-picker"><legend>選擇一個詞義</legend><p className="helper">切換義項會保留已修改文字，請重新確認繁中釋義與例句是否符合所選詞義。</p>
          <select aria-label="詞義" value={content.sense?.key ?? senseChoice} onChange={(event) => chooseSense(event.target.value)}>
            <option value="" disabled>請先選擇詞義</option>
            {retainedSense && <option lang="en" value={retainedSense.key}>先前已選（此次未回傳）：{retainedSense.partOfSpeech} — {retainedSense.gloss}</option>}
            {draft.senses?.map((sense) => <option lang="en" key={sense.key} value={sense.key}>{sense.partOfSpeech} — {sense.gloss}</option>)}
            <option value="manual">以上皆不適用，確認以手動義項建立</option>
          </select>
        </fieldset>}
        {content.sense && <p className="selected-sense"><span lang="en">{content.sense.partOfSpeech} · {content.sense.gloss}</span><br /><span className="helper">口音：{content.sense.accent === 'unspecified' ? '未提供，尚未確認為美式' : content.sense.accent}</span></p>}
        <fieldset disabled={busy} className="editor-fields">
          <div className="two-columns"><label>單字<input lang="en" value={content.word} maxLength={100} onChange={(event) => update('word', event.target.value)} /></label><label>音標<input lang="en" value={content.ipa} maxLength={200} placeholder="例如 /ˈæp.əl/" onChange={(event) => update('ipa', event.target.value)} /></label></div>
          <label>中文釋義（必填）<input value={content.meaning} maxLength={2000} placeholder="確認詞義與詞性" onChange={(event) => update('meaning', event.target.value)} /></label>
          <div className="two-columns"><label>例句<textarea lang="en" value={content.example} maxLength={2000} onChange={(event) => update('example', event.target.value)} /></label><label>例句翻譯<textarea value={content.exampleTranslation} maxLength={2000} onChange={(event) => update('exampleTranslation', event.target.value)} /></label></div>
          <label>常用片語（每行一個，最多 10 個）<textarea lang="en" value={content.phrases.join('\n')} maxLength={3010} onChange={(event) => update('phrases', event.target.value.split('\n'))} /></label>
          <label>小故事<textarea lang="en" value={content.story} maxLength={4000} onChange={(event) => update('story', event.target.value)} /></label>
        </fieldset>
        <div className="media-preview"><span><Image size={19} /> 圖片服務待串接</span><button type="button" className="secondary" onClick={() => speak(content.word, setError)}><Volume2 size={17} /> 試聽合成語音</button></div><p className="helper">合成語音可能使用系統線上服務，非真人錄音；字典錄音僅記錄來源資訊，下載與播放待後續串接。</p>
        <FieldSources content={content} />
        <div className="editor-actions"><button className="text-button" disabled={busy} onClick={() => setDraft(null)}>取消預覽</button><button className="primary" disabled={busy || needsSenseChoice || !content.meaning.trim() || !content.word.trim()} onClick={() => void save()}><Check size={17} />{busy && !previewing ? '儲存中…' : '確認儲存，加入下一個'}</button></div>
      </div>}
    </section>
    <section className="saved-section"><div className="section-header"><h3>已收藏的單字 <span className="muted">{notes.length}</span></h3><span className="helper">新增單字會立即進入複習</span></div>
      {notes.length === 0 ? <div className="empty-state"><span className="empty-icon"><Sprout size={30} strokeWidth={1.4} /></span><h3>第一個單字，從這裡開始。</h3><p>加入你在閱讀、旅行或生活裡遇見的字。</p></div> : <div className="note-grid">{notes.map(({ id, content: note }) => <article className="note-card" key={id}><div><h3 lang="en">{note.word}</h3><button className="icon-button" aria-label={`播放 ${note.word} 合成語音`} title="合成語音，可能使用線上服務" onClick={() => speak(note.word, setError)}><Volume2 size={18} /></button></div><span className="ipa" lang="en">{note.ipa || '尚無音標'}</span><p>{note.meaning}</p>{note.sense && <p className="helper" lang="en">{note.sense.partOfSpeech} · {note.sense.gloss}</p>}<span className="tag">{note.sense ? '字典義項 · 已校閱' : note.source.kind === 'demo' ? '示範內容 · 已校閱' : '手動內容'}</span><FieldSources content={note} /></article>)}</div>}
    </section>
  </>;
}
