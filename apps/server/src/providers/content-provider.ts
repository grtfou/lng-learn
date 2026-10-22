import type { Draft } from '../../../../packages/shared/src/contracts';

export interface ContentProvider {
  readonly name: string;
  draft(input: { word: string; language: 'en-US' }, signal?: AbortSignal): Promise<Draft>;
}

// 正式介面保留來源與授權；不同欄位來源、媒體下載與工作佇列見 docs/PLAN.md。
