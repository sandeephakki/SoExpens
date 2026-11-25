// dal/backup.js — JSON text in/out. No validation here (that is BAL's job).

export const MAX_BACKUP_CHARS = 5 * 1024 * 1024;

export function toBackupText(doc) {
  return JSON.stringify(doc, null, 1);
}

// Throws Error('empty' | 'too_big' | 'not_json').
export function parseBackupText(text) {
  if (typeof text !== 'string' || text.trim() === '') throw new Error('empty');
  if (text.length > MAX_BACKUP_CHARS) throw new Error('too_big');
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('not_json');
  }
}

export function backupFileName(isoDate) {
  return `soexpens-backup-${isoDate}.json`;
}
