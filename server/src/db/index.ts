import Database from 'better-sqlite3'
import { SCHEMA } from './schema.js'
import path from 'path'

let db: Database.Database | null = null

export function getDb(dbPath?: string): Database.Database {
  if (db) return db
  const resolvedPath = dbPath ?? path.join(process.env.DATA_DIR ?? process.cwd(), 'data.db')
  db = new Database(resolvedPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}
