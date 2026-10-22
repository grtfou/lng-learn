import type { DictionaryIssue, DictionarySense } from '../../../../packages/shared/src/contracts';

export interface DictionaryProvider {
  readonly name: string;
  lookup(input: { word: string; language: 'en-US' }, signal?: AbortSignal): Promise<DictionarySense[]>;
}

export class DictionaryError extends Error {
  constructor(public issue: DictionaryIssue) { super(issue.code); }
}
