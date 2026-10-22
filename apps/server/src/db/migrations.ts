import type { DatabaseSync } from 'node:sqlite';
import type { Content } from '../../../../packages/shared/src/contracts';
import { completeSources } from '../../../../packages/shared/src/provenance';
import { insertNoteMetadata } from './note-metadata';

export const migrations: { version: number; sql: string; foreignKeysOff?: boolean; migrate?: (db: DatabaseSync) => void }[] = [{
  version: 1,
  sql: `
    CREATE TABLE decks (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, language TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE notes (
      id TEXT PRIMARY KEY, deck_id TEXT NOT NULL REFERENCES decks(id),
      normalized_word TEXT NOT NULL, content_json TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(deck_id, normalized_word)
    );
    CREATE TABLE cards (
      id TEXT PRIMARY KEY, note_id TEXT NOT NULL UNIQUE REFERENCES notes(id),
      state_json TEXT NOT NULL, due_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX cards_due ON cards(due_at);
    CREATE TABLE review_logs (
      request_id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES cards(id),
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 4), reviewed_at TEXT NOT NULL,
      before_json TEXT NOT NULL, after_json TEXT NOT NULL, log_json TEXT NOT NULL,
      scheduler_json TEXT NOT NULL, result_json TEXT NOT NULL
    );
    CREATE INDEX review_card_time ON review_logs(card_id, reviewed_at);
  `,
}, {
  version: 2,
  foreignKeysOff: true,
  sql: `
    CREATE TABLE notes_v2 (
      id TEXT PRIMARY KEY, deck_id TEXT NOT NULL REFERENCES decks(id),
      normalized_word TEXT NOT NULL, content_json TEXT NOT NULL, created_at TEXT NOT NULL,
      sense_key TEXT NOT NULL,
      UNIQUE(deck_id, normalized_word, sense_key)
    );
    INSERT INTO notes_v2 SELECT id, deck_id, normalized_word, content_json, created_at, 'manual' FROM notes;
    DROP TABLE notes;
    ALTER TABLE notes_v2 RENAME TO notes;
    CREATE TABLE senses (
      note_id TEXT PRIMARY KEY REFERENCES notes(id), lemma TEXT NOT NULL, sense_key TEXT NOT NULL,
      part_of_speech TEXT NOT NULL, gloss TEXT NOT NULL, accent TEXT NOT NULL, pronunciations_json TEXT NOT NULL
    );
    CREATE TABLE field_sources (
      note_id TEXT NOT NULL REFERENCES notes(id), field_path TEXT NOT NULL,
      kind TEXT NOT NULL, provider TEXT NOT NULL, source_url TEXT, author TEXT, license TEXT,
      license_url TEXT, retrieved_at TEXT, model TEXT, prompt_version TEXT,
      user_edited INTEGER NOT NULL CHECK(user_edited IN (0, 1)), status TEXT NOT NULL,
      PRIMARY KEY(note_id, field_path)
    );
  `,
  migrate(db) {
    for (const row of db.prepare('SELECT id, content_json FROM notes').all()) {
      const original = JSON.parse(row.content_json as string) as Content;
      const content = completeSources({ ...original, sense: null, fieldSources: {} }, true);
      db.prepare('UPDATE notes SET content_json = ? WHERE id = ?').run(JSON.stringify(content), row.id);
      insertNoteMetadata(db, row.id as string, content);
    }
  },
}];
