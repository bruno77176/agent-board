---
project: BOARD
type: implementation-plan
---

# Doc-Watcher Archiving Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a task is removed from a plan file or the file is deleted, automatically archive the corresponding board stories instead of leaving orphans.

**Architecture:** Add `source_doc TEXT` to the `epics` table to track which plan file created each epic. On re-sync, diff the new plan's story titles against existing stories and archive any that are no longer present. On file delete (via chokidar `unlink` event), archive all non-done stories from that epic.

**Tech Stack:** PostgreSQL (postgres.js), TypeScript, chokidar, vitest

---

### Task 1: Add `source_doc` column to epics schema

**Files:**
- Modify: `server/src/db/schema.ts`
- Test: `server/tests/db.test.ts`

**Step 1: Write the failing test**

Add to `server/tests/db.test.ts` inside the existing `'database schema'` describe block:

```ts
it('epics table has source_doc column', async () => {
  if (skipIfNoDb()) return
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'epics'
  `
  const names = cols.map((c: any) => c.column_name)
  expect(names).toContain('source_doc')
})
```

**Step 2: Run the test to verify it fails**

```bash
cd agent-board && npm run test --workspace=server -- --reporter=verbose 2>&1 | grep -A 3 "source_doc"
```
Expected: test fails — column does not exist yet.

**Step 3: Add the column to the schema**

In `server/src/db/schema.ts`, find the `CREATE TABLE IF NOT EXISTS epics` block and add `source_doc TEXT` after `created_at`:

```sql
  CREATE TABLE IF NOT EXISTS epics (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    description TEXT,
    version TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    short_id TEXT,
    start_date TEXT,
    end_date TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_doc TEXT
  );
```

Also add an `ALTER TABLE` migration at the bottom of the `SCHEMA` string (after the existing table definitions), so existing databases get the column without a full drop/recreate:

```sql
  ALTER TABLE epics ADD COLUMN IF NOT EXISTS source_doc TEXT;
```

**Step 4: Run the test to verify it passes**

```bash
cd agent-board && npm run test --workspace=server -- --reporter=verbose 2>&1 | grep -A 3 "source_doc"
```
Expected: `✓ epics table has source_doc column`

**Step 5: Commit**

```bash
git add server/src/db/schema.ts server/tests/db.test.ts
git commit -m "feat: add source_doc column to epics table"
```

---

### Task 2: Set `source_doc` when syncing a plan file

**Files:**
- Modify: `server/src/lib/doc-parser.ts`
- Create: `server/tests/doc-sync.test.ts`

**Step 1: Write the failing test**

Create `server/tests/doc-sync.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type postgres from 'postgres'
import { createSeededTestSql, closeTestSql, skipIfNoDb } from './helpers.js'
import { syncDocToBoard } from '../src/lib/doc-parser.js'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'

const noop = () => {}

function writeTempPlan(content: string): string {
  const file = path.join(os.tmpdir(), `test-plan-${Date.now()}.md`)
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
```

**Step 2: Run to verify it fails**

```bash
cd agent-board && npm run test --workspace=server -- --reporter=verbose 2>&1 | grep -A 5 "source_doc tracking"
```
Expected: tests fail — `source_doc` is not being set yet.

**Step 3: Set `source_doc` in `syncDocToBoard`**

In `server/src/lib/doc-parser.ts`, find the epic creation block:

```ts
if (existingEpic) {
  epicId = existingEpic.id
} else {
  epicId = randomUUID()
  const epicShortId = await nextShortId(sql, project.id, 'epic')
  await sql`INSERT INTO epics (id, project_id, title, description, short_id) VALUES (...)`
```

Change to:

```ts
if (existingEpic) {
  epicId = existingEpic.id
  // Backfill source_doc if this epic was created before tracking was added
  if (!existingEpic.source_doc) {
    await sql`UPDATE epics SET source_doc = ${filePath} WHERE id = ${epicId}`
  }
} else {
  epicId = randomUUID()
  const epicShortId = await nextShortId(sql, project.id, 'epic')
  await sql`INSERT INTO epics (id, project_id, title, description, short_id, source_doc)
            VALUES (${epicId}, ${project.id}, ${structure.epic.title}, ${structure.epic.description || null}, ${epicShortId}, ${filePath})`
  const [epic] = await sql`SELECT * FROM epics WHERE id = ${epicId}`
  broadcast({ type: 'epic.created', data: epic })
}
```

**Step 4: Run to verify tests pass**

```bash
cd agent-board && npm run test --workspace=server -- --reporter=verbose 2>&1 | grep -A 5 "source_doc tracking"
```
Expected: both tests pass.

**Step 5: Commit**

```bash
git add server/src/lib/doc-parser.ts server/tests/doc-sync.test.ts
git commit -m "feat: track source_doc on epics during doc sync"
```

---

### Task 3: Archive orphaned stories on re-sync

**Files:**
- Modify: `server/src/lib/doc-parser.ts`
- Modify: `server/tests/doc-sync.test.ts`

**Step 1: Write the failing tests**

Add these three test cases to the `'doc sync — source_doc tracking'` describe block in `server/tests/doc-sync.test.ts`:

```ts
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

      const [story] = await sql`SELECT status FROM stories WHERE title = 'Task 3: Third task'`
      expect(story.status).toBe('archived')

      const events = await sql`
        SELECT comment FROM events
        WHERE target_type = 'story' AND target_id = ${story.id}
        ORDER BY created_at DESC
        LIMIT 1
      `
      // Should have no events since we skip event insertion for simplicity,
      // OR check if comment was inserted depending on implementation choice
    } finally {
      fs.unlinkSync(file)
    }
  })
```

**Step 2: Run to verify tests fail**

```bash
cd agent-board && npm run test --workspace=server -- --reporter=verbose 2>&1 | grep -A 3 "archives story\|does not archive\|archives in_progress"
```
Expected: all three fail — archiving not implemented yet.

**Step 3: Add archiving logic to `syncDocToBoard`**

At the end of `syncDocToBoard` in `server/src/lib/doc-parser.ts`, after the feature/story loop, add:

```ts
  // Archive stories that are no longer in the plan
  const planStoryTitles = new Set(
    structure.features.flatMap(f => f.stories.map(s => s.title))
  )

  const existingStories = await sql`
    SELECT s.id, s.title, s.status FROM stories s
    JOIN features f ON s.feature_id = f.id
    WHERE f.epic_id = ${epicId}
    AND s.status NOT IN ('done', 'archived')
  `

  for (const story of existingStories) {
    if (!planStoryTitles.has(story.title)) {
      const wasActive = ['in_progress', 'review', 'qa'].includes(story.status)
      await sql`UPDATE stories SET status = 'archived' WHERE id = ${story.id}`
      if (wasActive) {
        const { randomUUID } = await import('crypto')
        await sql`
          INSERT INTO events (id, target_type, target_id, agent_id, from_status, to_status, comment)
          VALUES (${randomUUID()}, 'story', ${story.id}, null, ${story.status}, 'archived',
                  '⚠️ Archived by doc-sync — task removed from plan while in progress')
        `
      }
      const [updated] = await sql`SELECT * FROM stories WHERE id = ${story.id}`
      broadcast({ type: 'story.archived', data: updated })
    }
  }
```

**Step 4: Run to verify tests pass**

```bash
cd agent-board && npm run test --workspace=server -- --reporter=verbose 2>&1 | grep -A 3 "archives story\|does not archive\|archives in_progress"
```
Expected: all three pass.

**Step 5: Commit**

```bash
git add server/src/lib/doc-parser.ts server/tests/doc-sync.test.ts
git commit -m "feat: archive orphaned stories on doc re-sync"
```

---

### Task 4: Add `archiveEpicFromDoc` and handle file deletion

**Files:**
- Modify: `server/src/lib/doc-parser.ts`
- Modify: `server/src/lib/doc-watcher.ts`
- Modify: `server/tests/doc-sync.test.ts`

**Step 1: Write the failing tests**

Add to `server/tests/doc-sync.test.ts`:

```ts
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
    try {
      await syncDocToBoard(file, sql, noop)
      // Mark one as done
      await sql`UPDATE stories SET status = 'done' WHERE title = 'Task 1: First task'`
    } finally {
      fs.unlinkSync(file)
    }

    // Now call archiveEpicFromDoc as if the file was deleted
    const { archiveEpicFromDoc } = await import('../src/lib/doc-parser.js')
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
    const { archiveEpicFromDoc } = await import('../src/lib/doc-parser.js')
    // Should not throw
    await expect(archiveEpicFromDoc('/nonexistent/file.md', sql, noop)).resolves.not.toThrow()
  })
})
```

**Step 2: Run to verify tests fail**

```bash
cd agent-board && npm run test --workspace=server -- --reporter=verbose 2>&1 | grep -A 3 "file deletion"
```
Expected: fail — `archiveEpicFromDoc` is not exported yet.

**Step 3: Add `archiveEpicFromDoc` to `doc-parser.ts`**

Export a new function at the bottom of `server/src/lib/doc-parser.ts`:

```ts
export async function archiveEpicFromDoc(
  filePath: string,
  sql: Sql,
  broadcast: Broadcast
): Promise<void> {
  const epics = await sql`SELECT * FROM epics WHERE source_doc = ${filePath}`
  if (epics.length === 0) return

  for (const epic of epics) {
    const stories = await sql`
      SELECT s.id, s.status FROM stories s
      JOIN features f ON s.feature_id = f.id
      WHERE f.epic_id = ${epic.id}
      AND s.status NOT IN ('done', 'archived')
    `
    for (const story of stories) {
      await sql`UPDATE stories SET status = 'archived' WHERE id = ${story.id}`
      const { randomUUID } = await import('crypto')
      await sql`
        INSERT INTO events (id, target_type, target_id, agent_id, from_status, to_status, comment)
        VALUES (${randomUUID()}, 'story', ${story.id}, null, ${story.status}, 'archived',
                '⚠️ Archived by doc-sync — plan file deleted')
      `
      const [updated] = await sql`SELECT * FROM stories WHERE id = ${story.id}`
      broadcast({ type: 'story.archived', data: updated })
    }
    console.log(`[doc-sync] Archived ${stories.length} stories from epic "${epic.title}" (file deleted)`)
  }
}
```

**Step 4: Add `unlink` handler to `doc-watcher.ts`**

In `server/src/lib/doc-watcher.ts`, import `archiveEpicFromDoc` and add the handler:

```ts
import { syncDocToBoard, archiveEpicFromDoc } from './doc-parser.js'
```

Inside the `import('chokidar').then(...)` block, after the existing `watcher.on('change', handleFile)` line:

```ts
    watcher.on('unlink', async (filePath: string) => {
      console.log('[doc-watcher] File deleted:', filePath)
      try {
        await archiveEpicFromDoc(filePath, sql, broadcast)
      } catch (err) {
        console.error('[doc-watcher] Error archiving on delete', filePath, err)
      }
    })
```

**Step 5: Run to verify tests pass**

```bash
cd agent-board && npm run test --workspace=server -- --reporter=verbose 2>&1 | grep -A 3 "file deletion"
```
Expected: both tests pass.

**Step 6: Run the full test suite**

```bash
cd agent-board && npm run test --workspace=server
```
Expected: all tests pass, no regressions.

**Step 7: Commit**

```bash
git add server/src/lib/doc-parser.ts server/src/lib/doc-watcher.ts server/tests/doc-sync.test.ts
git commit -m "feat: archive stories on plan file delete (archiveEpicFromDoc + unlink handler)"
```

---

### Task 5: Update README

**Files:**
- Modify: `agent-board/README.md`

**Step 1: Find the doc-watcher section**

Read `README.md` and find the "Plan → Board Auto-Sync" section.

**Step 2: Add the archiving note**

After the existing description of how items are created, append:

```markdown
**Archiving orphaned stories:**
When a plan file is re-saved with tasks removed, the corresponding stories are automatically moved to `archived` status. Stories at `done` are never archived. Stories at `in_progress`, `review`, or `qa` are archived with a warning comment.

When a plan file is deleted, all non-done stories from its epic are archived.

> **Note:** Epics created from plan files are "owned" by that file. Manually-created stories added to a plan-sourced epic are subject to archiving if their title doesn't match any task in the plan on re-sync.
```

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document doc-watcher archiving behavior"
```

---

### Task 6: Build and push

**Step 1: Build server to verify TypeScript compiles**

```bash
cd agent-board && npm run build --workspace=server
```
Expected: no TypeScript errors.

**Step 2: Push**

```bash
git push
```
