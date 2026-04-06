import postgres from 'postgres'
import { SCHEMA } from './schema.js'

export type Sql = postgres.Sql

let _sql: postgres.Sql | null = null

export function getSql(): postgres.Sql {
  if (!_sql) throw new Error('DB not initialized — call initDb() first')
  return _sql
}

export async function initDb(): Promise<postgres.Sql> {
  if (_sql) return _sql
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL env var is required')
  _sql = postgres(connectionString, {
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
  })
  // Run schema (idempotent)
  await _sql.unsafe(SCHEMA)
  return _sql
}

export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end()
    _sql = null
  }
}

export async function nextShortId(
  sql: postgres.Sql,
  projectId: string,
  type: 'epic' | 'feature' | 'story'
): Promise<string> {
  const [project] = await sql`SELECT key, id FROM projects WHERE id = ${projectId} OR key = ${projectId}`
  const key = project.key
  const [row] = await sql`
    INSERT INTO id_sequences (project_id, type, seq) VALUES (${projectId}, ${type}, 1)
    ON CONFLICT (project_id, type) DO UPDATE SET seq = id_sequences.seq + 1
    RETURNING seq
  `
  const seq = row.seq
  if (type === 'epic') return `${key}-E${seq}`
  if (type === 'feature') return `${key}-F${seq}`
  return `${key}-${seq}`
}
