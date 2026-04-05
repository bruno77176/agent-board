---
project: BOARD
type: implementation-plan
---

# Doc-Watcher Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove all server-side doc-parsing infrastructure — chokidar watcher, syncDocToBoard, archiveEpicFromDoc, and related tests — since Claude now creates board items directly.

**Architecture:** Pure deletion. Remove files, remove imports, remove route, verify build and tests still pass.

**Tech Stack:** TypeScript, Express, vitest

---

### Task 1: Remove doc-watcher.ts and its call in index.ts

**Story ID:** BOARD-50

**Files:**
- Delete: `server/src/lib/doc-watcher.ts`
- Modify: `server/src/index.ts`

**Step 1: Delete doc-watcher.ts**

```bash
rm /c/Users/bruno.moise/agent-jira/agent-board/server/src/lib/doc-watcher.ts
```

**Step 2: Remove the import and call from server/src/index.ts**

Remove line 15:
```ts
import { startDocWatcher } from './lib/doc-watcher.js'
```

Remove lines 79–80:
```ts
const DOCS_ROOT = process.env.DOCS_PATH ?? path.resolve(process.cwd(), '..', 'docs')
startDocWatcher(sql, DOCS_ROOT, broadcast)
```

**Step 3: Build to verify no errors**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && npm run build --workspace=server 2>&1 | tail -10
```
Expected: no TypeScript errors.

**Step 4: Run tests**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && npm run test --workspace=server 2>&1 | tail -10
```
Expected: all pass.

**Step 5: Commit**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && git add -A && git commit -m "feat: remove doc-watcher (chokidar auto-sync)"
```

**Step 6: Board**

`start_story` BOARD-50 as dev-in before starting. `complete_story` after commit.

---

### Task 2: Strip doc-parser.ts down to parseFrontmatter only

**Story ID:** BOARD-51

**Files:**
- Modify: `server/src/lib/doc-parser.ts`

**Step 1: Read doc-parser.ts** to understand the full file.

**Step 2: Replace the entire file** with only the `parseFrontmatter` function (everything else goes):

```ts
/**
 * Parse YAML frontmatter from a markdown string.
 * Returns data object and the body (without frontmatter).
 */
export function parseFrontmatter(content: string): { data: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { data: {}, body: content }
  const data: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim()
      const value = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '')
      if (key) data[key] = value
    }
  }
  return { data, body: match[2] }
}
```

Check if `parseFrontmatter` is imported anywhere else in the codebase before removing the rest:

```bash
grep -r "parseFrontmatter\|doc-parser" /c/Users/bruno.moise/agent-jira/agent-board/server/src --include="*.ts"
```

If nothing imports `parseFrontmatter`, delete the entire file instead.

**Step 3: Build**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && npm run build --workspace=server 2>&1 | tail -10
```

**Step 4: Run tests**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && npm run test --workspace=server 2>&1 | tail -10
```

**Step 5: Commit**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && git add -A && git commit -m "feat: strip doc-parser to parseFrontmatter only"
```

**Step 6: Board**

`start_story` BOARD-51, `complete_story` after commit.

---

### Task 3: Remove POST /api/docs/sync and doc-sync.test.ts

**Story ID:** BOARD-52

**Files:**
- Modify: `server/src/routes/docs.ts`
- Delete: `server/tests/doc-sync.test.ts`

**Step 1: Delete doc-sync.test.ts**

```bash
rm /c/Users/bruno.moise/agent-jira/agent-board/server/tests/doc-sync.test.ts
```

**Step 2: Remove POST /sync from docs.ts**

Read `server/src/routes/docs.ts`. Remove the entire `router.post('/sync', ...)` block (lines 32–69 in the current file). Leave `GET /`, `GET /*` intact.

The resulting file should only have: the `GET /` listing route, the `GET /*` content route, and the `walk` helper.

Also remove the unused `sql` and `broadcast` parameters from `docsRouter` if they're no longer used (check if any remaining route needs them). If not needed, simplify:

```ts
export function docsRouter(): Router {
```

And update the import in `server/src/routes/index.ts`:
```ts
router.use('/docs', docsRouter())
```

**Step 3: Build**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && npm run build --workspace=server 2>&1 | tail -10
```

**Step 4: Run tests**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && npm run test --workspace=server 2>&1 | tail -10
```

**Step 5: Commit**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && git add -A && git commit -m "feat: remove POST /docs/sync and doc-sync tests"
```

**Step 6: Board**

`start_story` BOARD-52, `complete_story` after commit.

---

### Task 4: Build, verify, push

**Story ID:** BOARD-53

**Step 1: Final full build**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && npm run build --workspace=server && npm run build --workspace=mcp 2>&1 | tail -15
```

**Step 2: Full test run**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && npm run test --workspace=server 2>&1 | tail -15
```

**Step 3: Push**

```bash
git push
```

**Step 4: Board**

`start_story` BOARD-53, `complete_story` after push.
