import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type postgres from 'postgres'
import { createSeededTestSql, closeTestSql, skipIfNoDb } from './helpers.js'
import { syncDocToBoard, archiveEpicFromDoc } from '../src/lib/doc-parser.js'
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

  it('archives story removed from plan on re-sync', async () => {
    if (skipIfNoDb()) return
    const file = writeTempPlan(PLAN_3_TASKS)
    try {
      await syncDocToBoard(file, sql, noop)

      // Re-sync with Task 3 removed
      const updatedPlan = PLAN_3_TASKS.replace('\n### Task 3: Third task\n- [ ] Criterion C\n', '')
      fs.writeFileSync(file, updatedPlan, 'utf-8')
      await syncDocToBoard(file, sql, noop)

      const stories = await sql`
        SELECT s.title, s.status FROM stories s
        JOIN features f ON s.feature_id = f.id
        JOIN epics e ON f.epic_id = e.id
        WHERE e.title = 'Test Feature'
        ORDER BY s.title
      `
      const byTitle = Object.fromEntries(stories.map((s: any) => [s.title, s.status]))
      expect(byTitle['Task 1: First task']).toBe('backlog')
      expect(byTitle['Task 2: Second task']).toBe('backlog')
      expect(byTitle['Task 3: Third task']).toBe('archived')
    } finally {
      fs.unlinkSync(file)
    }
  })

  it('does not archive done stories on re-sync', async () => {
    if (skipIfNoDb()) return
    const file = writeTempPlan(PLAN_3_TASKS)
    try {
      await syncDocToBoard(file, sql, noop)

      // Mark Task 3 as done
      await sql`UPDATE stories SET status = 'done' WHERE title = 'Task 3: Third task'`

      // Re-sync with Task 3 removed
      const updatedPlan = PLAN_3_TASKS.replace('\n### Task 3: Third task\n- [ ] Criterion C\n', '')
      fs.writeFileSync(file, updatedPlan, 'utf-8')
      await syncDocToBoard(file, sql, noop)

      const [story] = await sql`SELECT status FROM stories WHERE title = 'Task 3: Third task'`
      expect(story.status).toBe('done')
    } finally {
      fs.unlinkSync(file)
    }
  })

  it('archives in_progress story with warning comment on re-sync', async () => {
    if (skipIfNoDb()) return
    const file = writeTempPlan(PLAN_3_TASKS)
    try {
      await syncDocToBoard(file, sql, noop)

      // Mark Task 3 as in_progress
      await sql`UPDATE stories SET status = 'in_progress' WHERE title = 'Task 3: Third task'`

      // Re-sync with Task 3 removed
      const updatedPlan = PLAN_3_TASKS.replace('\n### Task 3: Third task\n- [ ] Criterion C\n', '')
      fs.writeFileSync(file, updatedPlan, 'utf-8')
      await syncDocToBoard(file, sql, noop)

      const [story] = await sql`SELECT id, status FROM stories WHERE title = 'Task 3: Third task'`
      expect(story.status).toBe('archived')

      const events = await sql`
        SELECT comment FROM events
        WHERE target_type = 'story' AND target_id = ${story.id}
        ORDER BY created_at DESC
        LIMIT 1
      `
      expect(events.length).toBeGreaterThan(0)
      expect(events[0].comment).toContain('Archived by doc-sync')
    } finally {
      fs.unlinkSync(file)
    }
  })
})

describe('doc sync — file deletion', () => {
  let sql: postgres.Sql

  beforeEach(async () => {
    if (skipIfNoDb()) return
    sql = await createSeededTestSql()
    await sql`INSERT INTO projects (id, key, name, description, is_public)
              VALUES ('proj-1', 'BOARD', 'Board', '', true)
              ON CONFLICT DO NOTHING`
  })

  afterEach(async () => {
    if (sql) await closeTestSql(sql)
  })

  it('archives all non-done stories when plan file is deleted', async () => {
    if (skipIfNoDb()) return
    const file = writeTempPlan(PLAN_3_TASKS)
    // Sync the file to create epic/stories, then delete the temp file
    await syncDocToBoard(file, sql, noop)
    // Mark Task 1 as done
    await sql`UPDATE stories SET status = 'done' WHERE title = 'Task 1: First task'`
    // Delete the file (simulating the unlink event)
    fs.unlinkSync(file)

    await archiveEpicFromDoc(file, sql, noop)

    const stories = await sql`
      SELECT title, status FROM stories s
      JOIN features f ON s.feature_id = f.id
      JOIN epics e ON f.epic_id = e.id
      WHERE e.title = 'Test Feature'
      ORDER BY title
    `
    const byTitle = Object.fromEntries(stories.map((s: any) => [s.title, s.status]))
    expect(byTitle['Task 1: First task']).toBe('done')      // preserved
    expect(byTitle['Task 2: Second task']).toBe('archived') // archived
    expect(byTitle['Task 3: Third task']).toBe('archived')  // archived
  })

  it('does nothing if no epic has that source_doc', async () => {
    if (skipIfNoDb()) return
    await expect(archiveEpicFromDoc('/nonexistent/file.md', sql, noop)).resolves.not.toThrow()
  })
})
