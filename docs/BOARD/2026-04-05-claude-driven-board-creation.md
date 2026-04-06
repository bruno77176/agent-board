---
project: BOARD
type: implementation-plan
---

# Claude-Driven Board Creation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After writing a plan file, Claude uploads it to the server (for UI visibility), then creates the epic/feature/stories with full template content using MCP tools. The epic stores a reference to the source plan file, shown as a clickable link in the UI.

**Architecture:** New `POST /api/docs/upload` route stores docs permanently on the server. `source_doc` added to `create_epic`. New `upload_doc` MCP tool reads local files and uploads. Frontend shows plan link on epic detail. Writing-plans skill patched to run board setup after saving every plan.

**Tech Stack:** TypeScript, Express, React, postgres.js, MCP SDK

---

### Task 1: Add POST /api/docs/upload and source_doc to create_epic

**Story ID:** BOARD-54

**Files:**
- Modify: `server/src/routes/docs.ts`
- Modify: `server/src/routes/epics.ts`
- Modify: `server/src/routes/index.ts`
- Create: `server/tests/docs-upload.test.ts`

**Step 1: Write the failing tests**

Create `server/tests/docs-upload.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseFrontmatter } from '../src/lib/doc-parser.js'

// Unit test for parseFrontmatter (kept from old doc-parser)
describe('parseFrontmatter', () => {
  it('parses project key from frontmatter', () => {
    const content = '---\nproject: BOARD\ntype: plan\n---\n# Title\n'
    const { data, body } = parseFrontmatter(content)
    expect(data.project).toBe('BOARD')
    expect(body).toContain('# Title')
  })

  it('returns empty data when no frontmatter', () => {
    const { data } = parseFrontmatter('# Just a heading\n')
    expect(data).toEqual({})
  })
})

// planDisplayName utility
function planDisplayName(source_doc: string): string {
  const filename = source_doc.split('/').pop() ?? source_doc
  return filename
    .replace(/\.md$/, '')
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .split('-')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

describe('planDisplayName', () => {
  it('converts dated filename to readable name', () => {
    expect(planDisplayName('plans/2026-04-05-story-time-tracking.md')).toBe('Story Time Tracking')
  })

  it('handles filename without date prefix', () => {
    expect(planDisplayName('plans/my-feature.md')).toBe('My Feature')
  })

  it('handles just the filename', () => {
    expect(planDisplayName('2026-04-05-doc-watcher-cleanup.md')).toBe('Doc Watcher Cleanup')
  })
})
```

**Step 2: Run to verify tests pass (these are pure unit tests)**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && npm run test --workspace=server -- --reporter=verbose 2>&1 | grep -A5 "planDisplayName\|parseFrontmatter"
```

**Step 3: Add POST /api/docs/upload to docs.ts**

Read `server/src/routes/docs.ts`. The router function currently takes no parameters (after cleanup). Add `POST /upload` before the `GET /*` route:

```ts
// POST /api/docs/upload — store a doc permanently so it appears in the UI
router.post('/upload', async (req, res) => {
  const { path: docPath, content } = req.body
  if (!docPath || typeof docPath !== 'string' || !content || typeof content !== 'string') {
    return res.status(400).json({ error: 'path and content required' })
  }
  if (!docPath.endsWith('.md')) {
    return res.status(400).json({ error: 'Only .md files allowed' })
  }
  const DOCS_ROOT = process.env.DOCS_PATH ?? path.resolve(process.cwd(), '..', 'docs')
  const ROOT_WITH_SEP = DOCS_ROOT.endsWith(path.sep) ? DOCS_ROOT : DOCS_ROOT + path.sep
  const resolved = path.resolve(DOCS_ROOT, docPath)
  if (!resolved.startsWith(ROOT_WITH_SEP) && resolved !== DOCS_ROOT) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  // Create parent dirs if needed
  const dir = path.dirname(resolved)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(resolved, content, 'utf-8')
  res.json({ ok: true, path: docPath })
})
```

**Step 4: Add source_doc to create_epic route**

In `server/src/routes/epics.ts`, find `router.post('/', ...)`. Change:

```ts
const { project_id, title, description, version } = req.body
```
to:
```ts
const { project_id, title, description, version, source_doc } = req.body
```

And change the INSERT:
```ts
await sql`INSERT INTO epics (id, project_id, title, description, version, short_id) VALUES (${id}, ${project_id}, ${title}, ${description ?? null}, ${version ?? null}, ${short_id})`
```
to:
```ts
await sql`INSERT INTO epics (id, project_id, title, description, version, short_id, source_doc) VALUES (${id}, ${project_id}, ${title}, ${description ?? null}, ${version ?? null}, ${short_id}, ${source_doc ?? null})`
```

**Step 5: Build**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && npm run build --workspace=server 2>&1 | tail -10
```

**Step 6: Run all tests**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && npm run test --workspace=server 2>&1 | tail -10
```

**Step 7: Commit**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && git add -A && git commit -m "feat: add POST /docs/upload and source_doc to create_epic"
```

**Step 8: Board**

`start_story` BOARD-54, `complete_story` after commit.

---

### Task 2: Add upload_doc and source_doc to create_epic MCP tool

**Story ID:** BOARD-55

**Files:**
- Modify: `mcp/src/tools/board.ts`
- Modify: `mcp/src/index.ts`

**Step 1: Add uploadDoc to board.ts**

In `mcp/src/tools/board.ts`, add to the `board` object:

```ts
uploadDoc: (docPath: string, content: string) =>
  call('/docs/upload', 'POST', { path: docPath, content }),
```

**Step 2: Add upload_doc tool to index.ts**

In `mcp/src/index.ts`, add the import for `fs` and `path` at the top if not present:

```ts
import { readFileSync } from 'fs'
import { resolve } from 'path'
```

Add the tool after the existing doc/reading tools:

```ts
server.tool(
  'upload_doc',
  'Upload a local plan/doc file to the server so it appears in the board UI. Returns the relative path to use as source_doc when creating an epic.',
  {
    file_path: z.string().describe('Absolute local path to the .md file'),
    relative_path: z.string().describe('Relative path within docs root, e.g. "plans/2026-04-05-my-plan.md"'),
  },
  async ({ file_path, relative_path }) => {
    const content = readFileSync(resolve(file_path), 'utf-8')
    await board.uploadDoc(relative_path, content)
    return { content: [{ type: 'text' as const, text: `Uploaded: ${relative_path}` }] }
  }
)
```

**Step 3: Add source_doc to create_epic tool**

Find the `create_epic` tool in `mcp/src/index.ts`. Add `source_doc` to its schema:

```ts
server.tool(
  'create_epic',
  'Create a new epic under a project',
  {
    project_id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    version: z.string().optional().describe('e.g. v0.0.1'),
    source_doc: z.string().optional().describe('Relative path to the plan file, e.g. "plans/2026-04-05-my-plan.md"'),
  },
  async (args) => {
    const epic = await board.createEpic(args)
    return { content: [{ type: 'text' as const, text: `Epic created: ${epic.short_id ?? epic.id} — ${epic.title}` }] }
  }
)
```

**Step 4: Build MCP**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && npm run build --workspace=mcp 2>&1 | tail -10
```
Expected: no errors.

**Step 5: Commit**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && git add -A && git commit -m "feat: add upload_doc MCP tool and source_doc to create_epic"
```

**Step 6: Board**

`start_story` BOARD-55, `complete_story` after commit.

---

### Task 3: Frontend — show source_doc as clickable plan link on epic detail

**Story ID:** BOARD-56

**Files:**
- Modify: the epic detail view in `client/src/` (find it by searching for where epic data is rendered)

**Step 1: Find the epic detail component**

```bash
grep -r "epic\." /c/Users/bruno.moise/agent-jira/agent-board/client/src --include="*.tsx" -l
```

Read the relevant component(s) to understand where epic fields are displayed.

**Step 2: Add planDisplayName utility**

In the epic detail component file (or a shared `lib/utils.ts`), add:

```ts
export function planDisplayName(source_doc: string): string {
  const filename = source_doc.split('/').pop() ?? source_doc
  return filename
    .replace(/\.md$/, '')
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
```

**Step 3: Render the plan link**

In the epic detail view, where other epic metadata is shown, add:

```tsx
{epic.source_doc && (
  <a
    href={`/docs/${epic.source_doc}`}
    target="_blank"
    rel="noopener noreferrer"
    className="text-sm text-blue-600 hover:underline"
  >
    📄 {planDisplayName(epic.source_doc)}
  </a>
)}
```

**Step 4: Verify it renders** — check that an epic with `source_doc` shows the link, and one without shows nothing.

**Step 5: Commit**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && git add -A && git commit -m "feat: show source_doc plan link on epic detail"
```

**Step 6: Board**

`start_story` BOARD-56, `complete_story` after commit.

---

### Task 4: Patch writing-plans skill with Board Setup step

**Story ID:** BOARD-57

**Files:**
- Create: `agent-board/patches/superpowers/writing-plans-board-setup.patch`
- Modify: `agent-board/scripts/apply-superpowers-patches.sh`

**Step 1: Read the current writing-plans skill**

```bash
cat ~/.claude/plugins/cache/claude-plugins-official/superpowers/*/skills/writing-plans/SKILL.md
```

Find the "Execution Handoff" section — the patch inserts a "Board Setup" section before it.

**Step 2: Create the patch**

The patch adds the following block before the "## Execution Handoff" heading:

```markdown
## Board Setup (if agent-board MCP is available)

After saving the plan file, immediately create the board hierarchy. Do this BEFORE offering the execution choice.

**This is mandatory when mcp__agent-board__create_epic is available.**

### Step 1: Upload the plan to the server
```
upload_doc(
  file_path: "<absolute local path to the saved plan>",
  relative_path: "plans/<filename>.md"
)
```
Save the returned relative path — use it as `source_doc` in the next step.

### Step 2: Create the epic
Read `docs/templates/epic-template.md`. Fill every section using the plan:
- **Title**: H1 heading, strip "Implementation Plan" suffix
- **Context**: the problem this plan solves (from Goal + Architecture)
- **Objective**: the Goal sentence
- **Value**: why this matters to the project
- **Success Criteria**: derive from the plan's acceptance criteria or task outcomes

Call `create_epic(project_id, title, description, source_doc)`.

### Step 3: Create feature(s)
Read `docs/templates/feature-template.md`. For each H2 heading in the plan (or one "Tasks" feature if only H3s exist):
- **Title**: H2 heading text (or plan domain name)
- **Description**: what this feature enables, from the plan's architecture

Call `create_feature(epic_id, title, description)`.

### Step 4: Create stories
Read `docs/templates/story-template.md`. For each H3 task:
- **Title**: H3 heading text
- **Description**: fill the User Story and Acceptance Criteria from the task's steps and `- [ ]` lines
- **estimated_minutes**: step count × 5

Call `create_story(feature_id, title, description, estimated_minutes)`.

**Do not leave template placeholders. Fill every field with real content from the plan.**
```

Use `patch` command to create a `.patch` file targeting the writing-plans SKILL.md.

**Step 3: Add the patch to apply-superpowers-patches.sh**

In `agent-board/scripts/apply-superpowers-patches.sh`, add the new patch alongside the existing ones.

**Step 4: Apply the patch**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && bash scripts/apply-superpowers-patches.sh
```

**Step 5: Verify the skill looks correct**

```bash
cat ~/.claude/plugins/cache/claude-plugins-official/superpowers/*/skills/writing-plans/SKILL.md | grep -A 5 "Board Setup"
```

**Step 6: Commit**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && git add -A && git commit -m "feat: patch writing-plans with board setup step"
```

**Step 7: Board**

`start_story` BOARD-57, `complete_story` after commit.

---

### Task 5: Build all, test, push

**Story ID:** BOARD-58

**Step 1: Full build**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && npm run build --workspace=server && npm run build --workspace=mcp 2>&1 | tail -15
```

**Step 2: Full test**

```bash
cd /c/Users/bruno.moise/agent-jira/agent-board && npm run test --workspace=server 2>&1 | tail -10
```

**Step 3: Push**

```bash
git push
```

**Step 4: Board**

`start_story` BOARD-58, `complete_story` after push.
