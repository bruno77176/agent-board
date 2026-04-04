import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type postgres from 'postgres'
import { createTestSql, closeTestSql, skipIfNoDb } from './helpers.js'
import { seed } from '../src/db/seed.js'

describe('seed', () => {
  let sql: postgres.Sql

  beforeEach(async () => {
    if (skipIfNoDb()) return
    sql = await createTestSql()
  })

  afterEach(async () => {
    if (sql) await closeTestSql(sql)
  })

  it('inserts 3 workflows', async () => {
    if (skipIfNoDb()) return
    await seed(sql)
    const workflows = await sql`SELECT * FROM workflows`
    expect(workflows).toHaveLength(3)
  })

  it('inserts 10 agents', async () => {
    if (skipIfNoDb()) return
    await seed(sql)
    const agents = await sql`SELECT slug FROM agents`
    const slugs = agents.map((a: any) => a.slug)
    expect(slugs).toContain('tess-ter')
    expect(slugs).toContain('arch-lee')
    expect(slugs).toContain('dee-ploy')
    expect(slugs).toContain('deb-ugg')
    expect(slugs).toContain('rev-yu')
    expect(slugs).toContain('dev-in')
    expect(slugs).toContain('fron-tina')
    expect(slugs).toContain('doc-tor')
    expect(slugs).toContain('pip-lynn')
    expect(agents).toHaveLength(10)
  })

  it('is idempotent (safe to run twice)', async () => {
    if (skipIfNoDb()) return
    await seed(sql)
    await seed(sql)
    const agents = await sql`SELECT * FROM agents`
    expect(agents).toHaveLength(10)
  })
})
