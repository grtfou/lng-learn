import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { migrations } from './migrations';

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)');
    const upgrading = Boolean(db.prepare('SELECT version FROM schema_migrations WHERE version = 1').get());
    for (const migration of migrations) {
      if (db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(migration.version)) continue;
      // 升級既有磁碟 DB 前以 SQLite 自身建立含 WAL 內容的一致性快照。
      if (upgrading && path !== ':memory:')
        db.prepare('VACUUM INTO ?').run(`${path}.pre-v${migration.version}-${randomUUID()}.sqlite`);
      if (migration.foreignKeysOff) db.exec('PRAGMA foreign_keys = OFF');
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec(migration.sql);
        migration.migrate?.(db);
        if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('資料遷移外鍵檢查失敗');
        db.prepare('INSERT INTO schema_migrations(version) VALUES (?)').run(migration.version);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      if (migration.foreignKeysOff) db.exec('PRAGMA foreign_keys = ON');
    }
  } catch (error) { db.close(); throw error; }
  return db;
}
