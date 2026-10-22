import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrations } from '../apps/server/src/db/migrations';
import { openDatabase } from '../apps/server/src/db/database';
import { Library } from '../apps/server/src/services/library';
import { newState, schedule, schedulerInfo } from '../apps/server/src/services/scheduler';
import { DemoContentProvider } from '../apps/server/src/providers/demo-content';
import { FreeDictionaryProvider } from '../apps/server/src/providers/free-dictionary';
import { DictionaryContentProvider } from '../apps/server/src/providers/dictionary-content';
import { editField, selectSense } from '../packages/shared/src/provenance';
import bank from './fixtures/dictionary-bank.json';

const now = new Date('2026-10-22T00:00:00.000Z');
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function oldDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'lng-migration-')); dirs.push(dir);
  const path = join(dir, 'old.sqlite');
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY); INSERT INTO schema_migrations VALUES (1)');
  db.exec(migrations[0].sql);
  db.prepare('INSERT INTO decks VALUES (?, ?, ?, ?)').run('deck', '舊資料', 'en-US', now.toISOString());
  return { dir, path, db };
}

describe('P0 → P1.1 遷移與詞義保存', () => {
  it('升級前一致性備份；保留舊內容、FSRS、版本與完整 logs，重開不重跑', async () => {
    const { db, path, dir } = oldDatabase();
    const draft = await new DemoContentProvider().draft({ word: 'apple', language: 'en-US' });
    const { sense: _sense, fieldSources: _sources, ...original } = draft.content;
    db.prepare('INSERT INTO notes VALUES (?, ?, ?, ?, ?)').run('note', 'deck', 'apple', JSON.stringify(original), now.toISOString());
    const before = newState(now);
    const after = schedule(JSON.stringify(before), 3, now);
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?)').run('card', 'note', JSON.stringify(after.card), after.card.due.toISOString(), 7);
    db.prepare('INSERT INTO review_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('request', 'card', 3, now.toISOString(), JSON.stringify(before), JSON.stringify(after.card), JSON.stringify(after.log), JSON.stringify(schedulerInfo), '{}');
    const cards = db.prepare('SELECT * FROM cards').all(); const logs = db.prepare('SELECT * FROM review_logs').all();
    db.close();
    const upgraded = openDatabase(path);
    try {
      expect(upgraded.prepare('SELECT * FROM cards').all()).toEqual(cards);
      expect(upgraded.prepare('SELECT * FROM review_logs').all()).toEqual(logs);
      const content = new Library(upgraded, () => now).listNotes('deck')[0].content;
      expect(content).toMatchObject(original);
      expect(content.source.kind).toBe('demo');
      expect(content.fieldSources.meaning).toMatchObject({ kind: 'legacy', provider: 'demo', retrievedAt: null });
      expect(upgraded.prepare('SELECT count(*) AS count FROM field_sources').get()!.count).toBe(10);
      expect(upgraded.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(upgraded.prepare('PRAGMA foreign_keys').get()!.foreign_keys).toBe(1);
      expect(() => upgraded.prepare('DELETE FROM notes WHERE id = ?').run('note')).toThrow();
      const backups = readdirSync(dir).filter((name) => name.includes('.pre-v2-'));
      expect(backups).toHaveLength(1);
      const backup = new DatabaseSync(join(dir, backups[0]), { readOnly: true });
      try {
        expect(backup.prepare('SELECT * FROM cards').all()).toEqual(cards);
        expect(backup.prepare('SELECT * FROM review_logs').all()).toEqual(logs);
        expect(backup.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 1 }]);
      } finally { backup.close(); }
    } finally { upgraded.close(); }
    const reopened = openDatabase(path);
    try { expect(reopened.prepare('SELECT count(*) AS count FROM field_sources').get()!.count).toBe(10); }
    finally { reopened.close(); }
    expect(readdirSync(dir).filter((name) => name.includes('.pre-v2-'))).toHaveLength(1);
  });

  it('遷移內容損壞則整筆回滾，v1 schema 與資料仍在', () => {
    const { db, path } = oldDatabase();
    db.prepare('INSERT INTO notes VALUES (?, ?, ?, ?, ?)').run('broken', 'deck', 'broken', '{bad', now.toISOString());
    db.close();
    expect(() => openDatabase(path)).toThrow();
    const raw = new DatabaseSync(path);
    try {
      expect(raw.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 1 }]);
      expect(raw.prepare('SELECT content_json FROM notes').get()!.content_json).toBe('{bad');
      expect(raw.prepare("SELECT name FROM sqlite_master WHERE name IN ('notes_v2', 'field_sources')").all()).toEqual([]);
      expect(raw.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { raw.close(); }
  });

  it('相同詞不同義可以保存；同義、同庫、正規化變體仍去重，來源原子持久化', async () => {
    const db = openDatabase(':memory:');
    try {
      const library = new Library(db, () => now);
      const deck = library.createDeck({ name: 'bank', language: 'en-US' });
      const provider = new DictionaryContentProvider(new FreeDictionaryProvider({ fetch: async () => new Response(JSON.stringify(bank)), clock: () => now }));
      const draft = await provider.draft({ word: 'bank', language: 'en-US' });
      const financial = editField(selectSense(draft.content, draft.senses![0]), 'meaning', '銀行');
      const river = editField(selectSense(draft.content, draft.senses![1]), 'meaning', '河岸');
      const note = library.saveNote(deck.id, financial); library.saveNote(deck.id, river);
      expect(() => library.saveNote(deck.id, { ...financial, word: ' ＢＡＮＫ ' })).toThrow('已存在');
      expect(library.listDecks().find((item) => item.id === deck.id)!.total).toBe(2);
      expect(db.prepare('SELECT gloss FROM senses WHERE note_id = ?').get(note.id)!.gloss).toBe(financial.sense!.gloss);
      expect(db.prepare("SELECT kind, user_edited FROM field_sources WHERE note_id = ? AND field_path = 'meaning'").get(note.id)).toEqual({ kind: 'manual', user_edited: 1 });
      expect(library.queue(deck.id).cards[0].content.sense).not.toBeNull();
      const other = library.createDeck({ name: 'other', language: 'en-US' });
      expect(() => library.saveNote(other.id, financial)).not.toThrow();
      db.exec("CREATE TRIGGER fail_sources BEFORE INSERT ON field_sources BEGIN SELECT RAISE(ABORT, 'source failed'); END");
      expect(() => library.saveNote(deck.id, { ...financial, word: 'manual', sense: null })).toThrow('source failed');
      expect(library.listDecks().find((item) => item.id === deck.id)!.total).toBe(2);
      expect(library.listNotes(deck.id)).toHaveLength(2);
    } finally { db.close(); }
  });
});
