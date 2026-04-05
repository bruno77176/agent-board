import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type postgres from 'postgres'
import { createTestSql, closeTestSql, skipIfNoDb } from './helpers.js'

describe('database schema', () => {
  let sql: postgres.Sql

  beforeEach(async () => {
    if (skipIfNoDb()) return
    sql = await createTestSql()
  })

  afterEach(async () => {
    if (sql) await closeTestSql(sql)
  })

  it('creates all tables on init', async () => {
    if (skipIfNoDb()) return
    const rows = await sql`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `
    const tables = rows.map((r: any) => r.tablename)
    expect(tables).toContain('projects')
    expect(tables).toContain('epics')
    expect(tables).toContain('features')
    expect(tables).toContain('stories')
    expect(tables).toContain('agents')
    expect(tables).toContain('workflows')
    expect(tables).toContain('events')
  })

  it('events table has target_type and target_id columns', async () => {
    if (skipIfNoDb()) return
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'events' AND table_schema = 'public'
    `
    const names = cols.map((c: any) => c.column_name)
    expect(names).toContain('target_type')
    expect(names).toContain('target_id')
    expect(names).not.toContain('story_id')
  })

  it('creates users and project_members tables', async () => {
    if (skipIfNoDb()) return
    const rows = await sql`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `
    const tables = rows.map((r: any) => r.tablename)
    expect(tables).toContain('users')
    expect(tables).toContain('project_members')
  })

  it('projects table has is_public column', async () => {
    if (skipIfNoDb()) return
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'projects' AND table_schema = 'public'
    `
    const names = cols.map((c: any) => c.column_name)
    expect(names).toContain('is_public')
  })

  it('epics table has source_doc column', async () => {
    if (skipIfNoDb()) return
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'epics'
    `
    const names = cols.map((c: any) => c.column_name)
    expect(names).toContain('source_doc')
  })
})
