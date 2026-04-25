import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../onecall.db');

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!instance) {
    instance = new Database(DB_PATH);
    instance.pragma('journal_mode = WAL');
  }
  return instance;
}
