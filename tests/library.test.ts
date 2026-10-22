import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../apps/server/src/db/database';
import { Library } from '../apps/server/src/services/library';
import { DemoContentProvider } from '../apps/server/src/providers/demo-content';
import { restoreState } from '../apps/server/src/services/scheduler';
import type { Content, Rating } from '../packages/shared/src/contracts';

describe('持久化與複習不變條件', () => {
  let db: DatabaseSync;
  let library: Library;
  let now: Date;
  let deckId: string;
  let content: Content;
  beforeEach(async () => {
    now = new Date('2026-10-22T00:00:00.000Z');
    db = openDatabase(':memory:'); library = new Library(db, () => now);
    deckId = library.createDeck({ name: '日常英語', language: 'en-US' }).id;
    content = (await new DemoContentProvider().draft({ word: 'apple', language: 'en-US' })).content;
  });
  afterEach(() => db.close());
  const count = () => db.prepare('SELECT count(*) AS total FROM review_logs').get()!.total;

  it('預覽不會保存；儲存後才建立 note 與到期卡', () => {
    expect(library.listNotes(deckId)).toHaveLength(0);
    library.saveNote(deckId, content);
    expect(library.listNotes(deckId)).toHaveLength(1);
    expect(library.queue(deckId).cards).toHaveLength(1);
    expect(library.listDecks()[0]).toMatchObject({ total: 1, due: 1 });
  });
  it('同庫正規化去重；不同庫可以保存相同單字', () => {
    library.saveNote(deckId, content);
    expect(() => library.saveNote(deckId, { ...content, word: ' ＡＰＰＬＥ ' })).toThrow('已存在');
    expect(library.queue(deckId).cards).toHaveLength(1);
    const second = library.createDeck({ name: '旅行', language: 'en-US' });
    expect(() => library.saveNote(second.id, content)).not.toThrow();
  });
  it.each([1, 2, 3, 4] as Rating[])('評分 %i 產生未來到期日、完整狀態與可重播紀錄', (rating) => {
    library.saveNote(deckId, content);
    const card = library.queue(deckId).cards[0];
    const result = library.review(card.id, { requestId: randomUUID(), rating, version: 0 });
    expect(new Date(result.dueAt).getTime()).toBeGreaterThan(now.getTime());
    expect(result.version).toBe(1);
    expect(library.queue(deckId).cards).toHaveLength(0);
    expect(library.queue(deckId).nextDueAt).toBe(result.dueAt);
    const log = db.prepare('SELECT * FROM review_logs').get()!;
    expect(restoreState(log.after_json as string).reps).toBe(1);
    expect(JSON.parse(log.scheduler_json as string).config.w.length).toBeGreaterThan(0);
    expect(count()).toBe(1);
    now = new Date(result.dueAt);
    expect(library.queue(deckId).cards[0].version).toBe(1);
  });
  it('同一請求重試只計分一次；改用同一識別碼評其他結果會失敗', () => {
    library.saveNote(deckId, content);
    const card = library.queue(deckId).cards[0];
    const input = { requestId: randomUUID(), rating: 3 as const, version: 0 };
    const result = library.review(card.id, input);
    now = new Date(now.getTime() + 1000);
    expect(library.review(card.id, input)).toEqual(result);
    expect(() => library.review(card.id, { ...input, rating: 4 })).toThrow('其他評分');
    expect(count()).toBe(1);
  });
  it('另一分頁的舊版本評分被拒絕；不更動已保存的紀錄', () => {
    library.saveNote(deckId, content);
    const card = library.queue(deckId).cards[0];
    library.review(card.id, { requestId: randomUUID(), rating: 3, version: 0 });
    expect(() => library.review(card.id, { requestId: randomUUID(), rating: 1, version: 0 })).toThrow('已更新');
    expect(count()).toBe(1);
    expect(library.listDecks()[0].due).toBe(0);
  });
  it('拒絕提前複習；交易 rollback 後仍可正常操作', () => {
    library.saveNote(deckId, content);
    const card = library.queue(deckId).cards[0];
    library.review(card.id, { requestId: randomUUID(), rating: 1, version: 0 });
    expect(() => library.review(card.id, { requestId: randomUUID(), rating: 3, version: 1 })).toThrow('尚未到');
    library.saveNote(deckId, { ...content, word: 'pear' });
    expect(library.listDecks()[0].total).toBe(2);
    expect(count()).toBe(1);
  });
  it('複習紀錄寫入失敗時，卡片狀態同步 rollback', () => {
    library.saveNote(deckId, content);
    const card = library.queue(deckId).cards[0];
    db.exec(`CREATE TRIGGER fail_log BEFORE INSERT ON review_logs BEGIN SELECT RAISE(ABORT, 'disk simulation'); END;`);
    expect(() => library.review(card.id, { requestId: randomUUID(), rating: 3, version: 0 })).toThrow();
    expect(library.queue(deckId).cards[0]).toMatchObject({ id: card.id, version: 0 });
    expect(count()).toBe(0);
  });
});
