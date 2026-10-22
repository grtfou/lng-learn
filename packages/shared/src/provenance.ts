import { contentFields, normalizeWord, type Content, type ContentField, type DictionarySense, type FieldSource } from './contracts';

export function manualSource(status: FieldSource['status'] = 'missing'): FieldSource {
  return { kind: 'manual', provider: 'manual', url: null, author: null, license: null, licenseUrl: null,
    retrievedAt: null, model: null, promptVersion: null, userEdited: false, status };
}

export function hasValue(value: unknown): boolean {
  return Array.isArray(value) ? value.some(Boolean) : typeof value === 'string' ? value.trim().length > 0 : value != null;
}

/** 保留來源出處，人工修改只增加旗標；不把字典內容重新標成未修改的擷取資料。 */
export function completeSources(content: Content, legacy = false): Content {
  const fieldSources = { ...content.fieldSources };
  for (const field of contentFields) {
    fieldSources[field] ??= {
      ...manualSource(), kind: legacy ? 'legacy' : content.source.kind, provider: content.source.provider,
      url: content.source.url?.startsWith('https:') ? content.source.url : null, license: content.source.license,
      status: hasValue(content[field]) ? 'ready' : 'missing',
    };
  }
  return { ...content, fieldSources };
}

export function editField(content: Content, field: ContentField, value: string | string[]): Content {
  const updated = completeSources(content);
  if (field === 'word' && normalizeWord(String(value)) !== normalizeWord(content.word)) {
    // 改詞形後舊義項不再有效，需重新查詢或以手動義項儲存。
    updated.sense = null;
    updated.fieldSources.sense = manualSource();
  }
  return { ...updated, [field]: value, fieldSources: { ...updated.fieldSources,
    [field]: { ...updated.fieldSources[field]!, userEdited: true, status: hasValue(value) ? 'ready' : 'missing' },
  } };
}

export function selectSense(content: Content, candidate: DictionarySense | null): Content {
  if (!candidate) return { ...content, sense: null, fieldSources: { ...content.fieldSources, sense: manualSource() } };
  const { example, ...sense } = candidate;
  const next: Content = { ...content, word: sense.lemma, sense,
    fieldSources: { ...content.fieldSources, word: sense.source, sense: sense.source } };
  // 已人工修改的欄位不受詞義切換覆寫。
  if (!next.fieldSources.ipa?.userEdited) {
    next.ipa = sense.pronunciations.find((item) => item.ipa)?.ipa ?? '';
    next.fieldSources.ipa = { ...sense.source, status: next.ipa ? 'ready' : 'missing' };
  }
  if (!next.fieldSources.example?.userEdited) {
    next.example = example;
    next.fieldSources.example = { ...sense.source, status: example ? 'ready' : 'missing' };
  }
  return next;
}
