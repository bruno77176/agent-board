import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type postgres from 'postgres'
import { createSeededTestSql, closeTestSql, skipIfNoDb } from './helpers.js'
import { syncDocToBoard } from '../src/lib/doc-parser.js'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { randomUUID } from 'crypto'

const noop = () => {}

function writeTempPlan(content: string): string {
  const file = path.join(os.tmpdir(), `test-plan-${randomUUID()}.md`)
  fs.writeFileSync(file, content, 'utf-8')
  return file
}

const PLAN_3_TASKS = `---
project: BOARD
type: implementation-plan
---

# Test Feature

### Task 1: First task
- [ ] Criterion A

### Task 2: Second task
- [ ] Criterion B

### Task 3: Third task
- [ ] Criterion C
`

describe('doc sync — source_doc tracking', () => {
  let sql: postgres.Sql

  beforeEach(async () => {
    if (skipIfNoDb()) return
    sql = await createSeededTestSql()
    // Ensure BOARD project exists
    await sql`INSERT INTO projects (id, key, name, description, is_public)
              VALUES ('proj-1', 'BOARD', 'Board', '', true)
              ON CONFLICT DO NOTHING`
  })

  afterEach(async () => {
    if (sql) await closeTestSql(sql)
  })

  it('sets source_doc on epic when created from a file', async () => {
    if (skipIfNoDb()) return
    const file = writeTempPlan(PLAN_3_TASKS)
    try {
      await syncDocToBoard(file, sql, noop)
      const [epic] = await sql`SELECT * FROM epics WHERE title = 'Test Feature'`
      expect(epic).toBeDefined()
      expect(epic.source_doc).toBe(file)
    } finally {
      fs.unlinkSync(file)
    }
  })

  it('updates source_doc on re-sync if previously null', async () => {
    if (skipIfNoDb()) return
    const file = writeTempPlan(PLAN_3_TASKS)
    try {
      await syncDocToBoard(file, sql, noop)
      // Manually null out source_doc to simulate old epic
      await sql`UPDATE epics SET source_doc = NULL WHERE title = 'Test Feature'`
      await syncDocToBoard(file, sql, noop)
      const [epic] = await sql`SELECT * FROM epics WHERE title = 'Test Feature'`
      expect(epic.source_doc).toBe(file)
    } finally {
      fs.unlinkSync(file)
    }
  })
})
