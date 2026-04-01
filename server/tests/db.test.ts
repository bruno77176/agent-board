import { describe, it, expect, beforeEach } from 'vitest'
import { getDb, closeDb } from '../src/db/index.js'

describe('database schema', () => {
  beforeEach(() => closeDb())

  it('creates all tables on init', () => {
    const db = getDb(':memory:')
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name)

    expect(tables).toContain('projects')
    expect(tables).toContain('epics')
    expect(tables).toContain('features')
    expect(tables).toContain('stories')
    expect(tables).toContain('agents')
    expect(tables).toContain('workflows')
    expect(tables).toContain('events')
  })

  it('events table has target_type and target_id columns', () => {
    const db = getDb(':memory:')
    const cols = db.prepare("PRAGMA table_info(events)").all() as any[]
    const names = cols.map(c => c.name)
    expect(names).toContain('target_type')
    expect(names).toContain('target_id')
    expect(names).not.toContain('story_id')
  })
})
