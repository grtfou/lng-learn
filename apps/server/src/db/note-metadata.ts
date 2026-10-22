import type { DatabaseSync } from 'node:sqlite';
import type { Content } from '../../../../packages/shared/src/contracts';

export function insertNoteMetadata(db: DatabaseSync, noteId: string, content: Content): void {
  if (content.sense) {
    const sense = content.sense;
    db.prepare('INSERT INTO senses VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      noteId, sense.lemma, sense.key, sense.partOfSpeech, sense.gloss, sense.accent, JSON.stringify(sense.pronunciations),
    );
  }
  const insert = db.prepare('INSERT INTO field_sources VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const [field, source] of Object.entries(content.fieldSources)) {
    insert.run(noteId, field, source.kind, source.provider, source.url, source.author, source.license,
      source.licenseUrl, source.retrievedAt, source.model, source.promptVersion, Number(source.userEdited), source.status);
  }
}
