import Database from 'better-sqlite3'
import { SCHEMA, MIGRATIONS } from './schema.js'
import path from 'path'

let db: Database.Database | null = null

export function nextShortId(db: Database.Database, projectId: string, type: 'epic' | 'feature' | 'story'): string {
  const project = db.prepare('SELECT key FROM projects WHERE id = ?').get(projectId) as any
  const key = project.key
  db.prepare(`
    INSERT INTO id_sequences (project_id, type, seq) VALUES (?, ?, 1)
    ON CONFLICT(project_id, type) DO UPDATE SET seq = seq + 1
  `).run(projectId, type)
  const row = db.prepare('SELECT seq FROM id_sequences WHERE project_id = ? AND type = ?').get(projectId, type) as any
  const seq = row.seq
  if (type === 'epic') return `${key}-E${seq}`
  if (type === 'feature') return `${key}-F${seq}`
  return `${key}-${seq}`
}

export function backfillShortIds(db: Database.Database): void {
  const projects = db.prepare('SELECT * FROM projects').all() as any[]
  for (const project of projects) {
    const epics = db.prepare('SELECT * FROM epics WHERE project_id = ? AND short_id IS NULL ORDER BY created_at').all(project.id) as any[]
    for (const epic of epics) {
      db.prepare(`INSERT INTO id_sequences (project_id, type, seq) VALUES (?, ?, 1) ON CONFLICT(project_id, type) DO UPDATE SET seq = seq + 1`).run(project.id, 'epic')
      const { seq } = db.prepare('SELECT seq FROM id_sequences WHERE project_id = ? AND type = ?').get(project.id, 'epic') as any
      db.prepare('UPDATE epics SET short_id = ? WHERE id = ?').run(`${project.key}-E${seq}`, epic.id)
    }
    const features = db.prepare(`SELECT f.* FROM features f JOIN epics e ON f.epic_id = e.id WHERE e.project_id = ? AND f.short_id IS NULL ORDER BY f.created_at`).all(project.id) as any[]
    for (const feature of features) {
      db.prepare(`INSERT INTO id_sequences (project_id, type, seq) VALUES (?, ?, 1) ON CONFLICT(project_id, type) DO UPDATE SET seq = seq + 1`).run(project.id, 'feature')
      const { seq } = db.prepare('SELECT seq FROM id_sequences WHERE project_id = ? AND type = ?').get(project.id, 'feature') as any
      db.prepare('UPDATE features SET short_id = ? WHERE id = ?').run(`${project.key}-F${seq}`, feature.id)
    }
    const stories = db.prepare(`SELECT s.* FROM stories s JOIN features f ON s.feature_id = f.id JOIN epics e ON f.epic_id = e.id WHERE e.project_id = ? AND s.short_id IS NULL ORDER BY s.created_at`).all(project.id) as any[]
    for (const story of stories) {
      db.prepare(`INSERT INTO id_sequences (project_id, type, seq) VALUES (?, ?, 1) ON CONFLICT(project_id, type) DO UPDATE SET seq = seq + 1`).run(project.id, 'story')
      const { seq } = db.prepare('SELECT seq FROM id_sequences WHERE project_id = ? AND type = ?').get(project.id, 'story') as any
      db.prepare('UPDATE stories SET short_id = ? WHERE id = ?').run(`${project.key}-${seq}`, story.id)
    }
  }
}

export function getDb(dbPath?: string): Database.Database {
  if (db) return db
  const resolvedPath = dbPath ?? path.join(process.env.DATA_DIR ?? process.cwd(), 'data.db')
  db = new Database(resolvedPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  for (const migration of MIGRATIONS) {
    try {
      db.exec(migration)
    } catch (e: any) {
      if (!e.message?.includes('duplicate column name')) throw e
    }
  }
  backfillShortIds(db)
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}
