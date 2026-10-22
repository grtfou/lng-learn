import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Content, Deck, Note, Rating, ReviewCard, ReviewResult } from '../../../../packages/shared/src/contracts';
import { normalizeWord } from '../../../../packages/shared/src/contracts';
import { newState, schedule, schedulerInfo } from './scheduler';

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

type CardRow = { id: string; note_id: string; state_json: string; due_at: string; version: number; content_json: string };

export class Library {
  constructor(private db: DatabaseSync, private clock: () => Date = () => new Date()) {}

  listDecks(): Deck[] {
    return this.db.prepare(`
      SELECT d.id, d.name, d.language, d.created_at AS createdAt,
        count(c.id) AS total, coalesce(sum(c.due_at <= ?), 0) AS due
      FROM decks d LEFT JOIN notes n ON n.deck_id = d.id LEFT JOIN cards c ON c.note_id = n.id
      GROUP BY d.id ORDER BY d.created_at, d.id
    `).all(this.clock().toISOString()) as Deck[];
  }

  requireDeck(id: string) {
    if (!this.db.prepare('SELECT id FROM decks WHERE id = ?').get(id))
      throw new AppError(404, 'DECK_NOT_FOUND', '找不到單字庫');
  }

  createDeck(input: { name: string; language: 'en-US' }): Deck {
    const deck = { id: randomUUID(), ...input, createdAt: this.clock().toISOString(), total: 0, due: 0 };
    this.db.prepare('INSERT INTO decks VALUES (?, ?, ?, ?)').run(deck.id, deck.name, deck.language, deck.createdAt);
    return deck;
  }

  listNotes(deckId: string): Note[] {
    this.requireDeck(deckId);
    const rows = this.db.prepare('SELECT * FROM notes WHERE deck_id = ? ORDER BY created_at DESC, id').all(deckId);
    return rows.map((row) => ({ id: row.id as string, deckId, createdAt: row.created_at as string, content: JSON.parse(row.content_json as string) }));
  }

  saveNote(deckId: string, content: Content): Note {
    this.requireDeck(deckId);
    const normalized = normalizeWord(content.word);
    const now = this.clock();
    const note = { id: randomUUID(), deckId, content: { ...content, word: content.word.trim() }, createdAt: now.toISOString() };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.db.prepare('SELECT id FROM notes WHERE deck_id = ? AND normalized_word = ?').get(deckId, normalized))
        throw new AppError(409, 'DUPLICATE_WORD', '這個單字已存在此單字庫');
      this.db.prepare('INSERT INTO notes VALUES (?, ?, ?, ?, ?)').run(note.id, deckId, normalized, JSON.stringify(note.content), note.createdAt);
      this.db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, 0)').run(randomUUID(), note.id, JSON.stringify(newState(now)), now.toISOString());
      this.db.exec('COMMIT');
      return note;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  queue(deckId: string): { cards: ReviewCard[]; nextDueAt: string | null } {
    this.requireDeck(deckId);
    const now = this.clock().toISOString();
    const rows = this.db.prepare(`SELECT c.*, n.content_json FROM cards c JOIN notes n ON n.id = c.note_id
      WHERE n.deck_id = ? AND c.due_at <= ? ORDER BY c.due_at, c.id LIMIT 100`).all(deckId, now) as CardRow[];
    const next = this.db.prepare(`SELECT min(c.due_at) AS nextDueAt FROM cards c JOIN notes n ON n.id = c.note_id
      WHERE n.deck_id = ? AND c.due_at > ?`).get(deckId, now);
    return {
      cards: rows.map((row) => ({ id: row.id, noteId: row.note_id, version: row.version, dueAt: row.due_at, content: JSON.parse(row.content_json) })),
      nextDueAt: next?.nextDueAt as string | null,
    };
  }

  review(cardId: string, input: { requestId: string; rating: Rating; version: number }): ReviewResult {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.db.prepare('SELECT * FROM review_logs WHERE request_id = ?').get(input.requestId);
      if (previous) {
        const result = JSON.parse(previous.result_json as string) as ReviewResult;
        if (previous.card_id !== cardId || previous.rating !== input.rating || result.version !== input.version + 1)
          throw new AppError(409, 'IDEMPOTENCY_CONFLICT', '此請求識別碼已被其他評分使用');
        this.db.exec('COMMIT'); return result;
      }
      const row = this.db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId) as CardRow | undefined;
      if (!row) throw new AppError(404, 'CARD_NOT_FOUND', '找不到單字卡');
      if (row.version !== input.version) throw new AppError(409, 'STALE_CARD', '單字卡已更新，請重新載入複習');
      const now = this.clock();
      if (row.due_at > now.toISOString()) throw new AppError(409, 'CARD_NOT_DUE', '此單字卡尚未到複習時間');
      const next = schedule(row.state_json, input.rating, now);
      const result = { requestId: input.requestId, cardId, dueAt: next.card.due.toISOString(), version: row.version + 1 };
      this.db.prepare('UPDATE cards SET state_json = ?, due_at = ?, version = ? WHERE id = ?')
        .run(JSON.stringify(next.card), result.dueAt, result.version, cardId);
      this.db.prepare('INSERT INTO review_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        input.requestId, cardId, input.rating, now.toISOString(), row.state_json,
        JSON.stringify(next.card), JSON.stringify(next.log), JSON.stringify(schedulerInfo), JSON.stringify(result),
      );
      this.db.exec('COMMIT'); return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
