import type { Content, Deck, Draft, Note, ReviewCard, ReviewResult, Rating } from '../../../packages/shared/src/contracts';

export class ApiError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok) throw new ApiError(value.error?.code ?? 'UNKNOWN', value.error?.message ?? '請求失敗');
  return value as T;
}
export const api = {
  decks: () => request<{ decks: Deck[] }>('/decks'),
  createDeck: (name: string) => request<Deck>('/decks', { name, language: 'en-US' }),
  draft: (word: string) => request<Draft>('/drafts', { word, language: 'en-US' }),
  notes: (deckId: string) => request<{ notes: Note[] }>(`/decks/${deckId}/notes`),
  save: (deckId: string, content: Content) => request<Note>(`/decks/${deckId}/notes`, { content }),
  queue: (deckId: string) => request<{ cards: ReviewCard[]; nextDueAt: string | null }>(`/decks/${deckId}/review`),
  review: (cardId: string, input: { requestId: string; rating: Rating; version: number }) => request<ReviewResult>(`/cards/${cardId}/reviews`, input),
};
