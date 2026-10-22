import type { Content, FieldSource } from '../../../../packages/shared/src/contracts';
import { completeSources } from '../../../../packages/shared/src/provenance';

const kinds: Record<FieldSource['kind'], string> = { demo: '內建示範', manual: '手動', retrieved: '字典擷取', generated: 'AI 生成', legacy: '舊版來源' };
const statuses = { pending: '待處理', ready: '有內容', missing: '缺漏', error: '取得失敗' };
const names = { word: '單字', ipa: '音標', meaning: '繁中釋義', example: '例句', exampleTranslation: '例句翻譯', phrases: '片語', story: '故事', image: '圖片', audio: '音檔', sense: '詞義／詞性' };

function Source({ source }: { source: FieldSource }) {
  return <span>{kinds[source.kind]} · {source.provider} · {statuses[source.status]}{source.userEdited && ' · 人工修改'}
    {source.url && <> · <a href={source.url} target="_blank" rel="noreferrer">原始來源</a></>}
    {source.license && <> · {source.licenseUrl ? <a href={source.licenseUrl} target="_blank" rel="noreferrer">{source.license}</a> : source.license}</>}
    {source.kind === 'retrieved' && <> · 作者：{source.author ?? '上游未提供'}{source.retrievedAt && <> · 取得時間：<time dateTime={source.retrievedAt}>{source.retrievedAt}</time></>}</>}
  </span>;
}

export function FieldSources({ content }: { content: Content }) {
  const sources = completeSources(content).fieldSources;
  return <details className="field-sources"><summary>欄位來源與授權</summary>
    <dl>{Object.entries(sources).map(([field, source]) => <div key={field}><dt>{names[field as keyof typeof names]}</dt><dd><Source source={source} /></dd></div>)}</dl>
    {content.sense && <>
      <p className="helper">字典口音：{content.sense.accent === 'unspecified' ? '上游未提供，尚未確認為美式' : content.sense.accent}。錄音者身分未驗證；目前僅記錄音檔資訊，不下載或播放。</p>
      {content.sense.pronunciations.map((item, index) => <div key={index} className="recording-metadata">
        <span lang="en">{item.ipa || '（無音標）'}</span>
        {item.recording ? <p>錄音 metadata：<Source source={item.recording.source} /> · <a href={item.recording.url} target="_blank" rel="noreferrer">音檔原址</a> · 錄音者身分未驗證</p> : <p>無具完整來源與授權的錄音資訊。</p>}
      </div>)}
    </>}
  </details>;
}
