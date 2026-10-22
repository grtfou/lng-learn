export const migrations = [{
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
}];
