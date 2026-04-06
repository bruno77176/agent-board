# Jira Clone Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add issue links (blocks/duplicates), drag-and-drop Kanban, swimlanes, and an epic roadmap timeline to agent-board.

**Architecture:** Two phases — Phase 1 lands all backend changes (DB migrations, new API routes, MCP tools) as a single commit; Phase 2 builds four independent frontend features that can be implemented in parallel by separate agents since they touch different files and all depend on Phase 1's schema.

**Tech Stack:** better-sqlite3, Express, React 19, TanStack Query, @dnd-kit/core, Vite, TypeScript, vitest + supertest (server tests)

---

## PHASE 1 — Backend (must land before Phase 2)

### Task 1: DB migrations — story_links table and epic dates

**Files:**
- Modify: `agent-board/server/src/db/schema.ts`

**Step 1: Add the story_links table to SCHEMA and epic-date migrations to MIGRATIONS**

In `schema.ts`, the `SCHEMA` constant is a template literal with all `CREATE TABLE IF NOT EXISTS` statements. The `MIGRATIONS` array is for `ALTER TABLE` statements applied at runtime (each is tried, and duplicate-column errors are silently swallowed — see `db/index.ts:53-57`).

Add the story_links table to SCHEMA (inside the template literal, after the events table):

```sql
  CREATE TABLE IF NOT EXISTS story_links (
    id TEXT PRIMARY KEY,
    from_story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    to_story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    link_type TEXT NOT NULL CHECK (link_type IN ('blocks', 'duplicates', 'relates_to')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
```

Add two entries to the end of the `MIGRATIONS` array:

```typescript
  `ALTER TABLE epics ADD COLUMN start_date TEXT`,
  `ALTER TABLE epics ADD COLUMN end_date TEXT`,
```

**Step 2: Run server tests to make sure nothing broke**

```bash
cd agent-board
npm run test --workspace=server
```

Expected: all existing tests pass (the new table is created by the schema, migrations silently no-op on re-run).

**Step 3: Commit**

```bash
git add agent-board/server/src/db/schema.ts
git commit -m "feat(db): add story_links table and epic start_date/end_date columns"
```

---

### Task 2: Story links API routes

**Files:**
- Create: `agent-board/server/src/routes/story-links.ts`
- Modify: `agent-board/server/src/routes/index.ts`
- Modify: `agent-board/server/src/routes/stories.ts` (include links in GET /:id)
- Test: `agent-board/server/tests/routes.test.ts`

**Step 1: Write failing tests for story links endpoints**

Add these describe blocks to the end of `agent-board/server/tests/routes.test.ts`:

```typescript
// Helper to create a full story (project → epic → feature → story)
async function createStory(app: Express.Application, title = 'Test Story') {
  const proj = await request(app).post('/api/projects').send({ key: 'LNK', name: 'Link Test', workflow_id: 'standard' })
  const epic = await request(app).post('/api/epics').send({ project_id: proj.body.id, title: 'E1' })
  const feat = await request(app).post('/api/features').send({ epic_id: epic.body.id, title: 'F1' })
  const story = await request(app).post('/api/stories').send({ feature_id: feat.body.id, title })
  return { proj: proj.body, epic: epic.body, feat: feat.body, story: story.body }
}

describe('Story links', () => {
  beforeEach(() => closeDb())

  it('creates a link between two stories', async () => {
    const app = buildApp()
    const { story: a } = await createStory(app, 'Story A')
    const { story: b } = await createStory(app, 'Story B')
    const res = await request(app)
      .post(`/api/stories/${a.id}/links`)
      .send({ to_story_id: b.id, link_type: 'blocks' })
    expect(res.status).toBe(201)
    expect(res.body.link_type).toBe('blocks')
    expect(res.body.from_story_id).toBe(a.id)
    expect(res.body.to_story_id).toBe(b.id)
  })

  it('returns links for a story including inverse direction', async () => {
    const app = buildApp()
    const { story: a } = await createStory(app, 'A')
    const { story: b } = await createStory(app, 'B')
    await request(app).post(`/api/stories/${a.id}/links`).send({ to_story_id: b.id, link_type: 'blocks' })
    const res = await request(app).get(`/api/stories/${b.id}/links`)
    expect(res.status).toBe(200)
    // B is blocked by A — the inverse should appear
    expect(res.body.some((l: any) => l.link_type === 'blocks' && l.from_story_id === a.id)).toBe(true)
  })

  it('deletes a link', async () => {
    const app = buildApp()
    const { story: a } = await createStory(app, 'A')
    const { story: b } = await createStory(app, 'B')
    const create = await request(app).post(`/api/stories/${a.id}/links`).send({ to_story_id: b.id, link_type: 'relates_to' })
    const linkId = create.body.id
    const del = await request(app).delete(`/api/stories/${a.id}/links/${linkId}`)
    expect(del.status).toBe(204)
    const list = await request(app).get(`/api/stories/${a.id}/links`)
    expect(list.body).toHaveLength(0)
  })

  it('includes links in GET /api/stories/:id', async () => {
    const app = buildApp()
    const { story: a } = await createStory(app, 'A')
    const { story: b } = await createStory(app, 'B')
    await request(app).post(`/api/stories/${a.id}/links`).send({ to_story_id: b.id, link_type: 'blocks' })
    const res = await request(app).get(`/api/stories/${a.id}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.links)).toBe(true)
    expect(res.body.links.length).toBeGreaterThan(0)
  })
})
```

Note: the `createStory` helper creates a project with key `LNK` — but two calls will conflict. Use `closeDb()` between tests which is already done via `beforeEach`. However the helper creates a new project each time; to avoid key conflicts, generate a unique key per call:

```typescript
let keyCounter = 0
async function createStory(app: any, title = 'Test Story') {
  const key = `L${++keyCounter}`.toUpperCase()
  const proj = await request(app).post('/api/projects').send({ key, name: 'Link Test', workflow_id: 'standard' })
  const epic = await request(app).post('/api/epics').send({ project_id: proj.body.id, title: 'E1' })
  const feat = await request(app).post('/api/features').send({ epic_id: epic.body.id, title: 'F1' })
  const story = await request(app).post('/api/stories').send({ feature_id: feat.body.id, title })
  return { proj: proj.body, epic: epic.body, feat: feat.body, story: story.body }
}
```

**Step 2: Run tests to confirm they fail**

```bash
cd agent-board
npm run test --workspace=server
```

Expected: FAIL — routes not yet implemented.

**Step 3: Create `agent-board/server/src/routes/story-links.ts`**

```typescript
import { Router } from 'express'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { Broadcast } from '../ws/index.js'

export function storyLinksRouter(db: Database.Database, broadcast: Broadcast): Router {
  const router = Router({ mergeParams: true })

  // GET /api/stories/:id/links — return all links involving this story
  router.get('/', (req, res) => {
    const story = db.prepare('SELECT id FROM stories WHERE id = ? OR short_id = ?').get(req.params.id, req.params.id) as any
    if (!story) return res.status(404).json({ error: 'Not found' })
    const links = db.prepare(
      'SELECT * FROM story_links WHERE from_story_id = ? OR to_story_id = ? ORDER BY created_at'
    ).all(story.id, story.id)
    res.json(links)
  })

  // POST /api/stories/:id/links
  router.post('/', (req, res) => {
    const { to_story_id, link_type } = req.body
    if (!to_story_id || !link_type) return res.status(400).json({ error: 'to_story_id and link_type required' })
    const validTypes = ['blocks', 'duplicates', 'relates_to']
    if (!validTypes.includes(link_type)) return res.status(400).json({ error: `link_type must be one of: ${validTypes.join(', ')}` })
    const story = db.prepare('SELECT id FROM stories WHERE id = ? OR short_id = ?').get(req.params.id, req.params.id) as any
    if (!story) return res.status(404).json({ error: 'Story not found' })
    const toStory = db.prepare('SELECT id FROM stories WHERE id = ? OR short_id = ?').get(to_story_id, to_story_id) as any
    if (!toStory) return res.status(404).json({ error: 'Target story not found' })
    const id = randomUUID()
    db.prepare('INSERT INTO story_links (id, from_story_id, to_story_id, link_type) VALUES (?, ?, ?, ?)')
      .run(id, story.id, toStory.id, link_type)
    const link = db.prepare('SELECT * FROM story_links WHERE id = ?').get(id)
    broadcast({ type: 'story_link.created', data: link })
    res.status(201).json(link)
  })

  // DELETE /api/stories/:id/links/:linkId
  router.delete('/:linkId', (req, res) => {
    const link = db.prepare('SELECT * FROM story_links WHERE id = ?').get(req.params.linkId) as any
    if (!link) return res.status(404).json({ error: 'Not found' })
    db.prepare('DELETE FROM story_links WHERE id = ?').run(req.params.linkId)
    broadcast({ type: 'story_link.deleted', data: { id: req.params.linkId, from_story_id: link.from_story_id, to_story_id: link.to_story_id } })
    res.status(204).send()
  })

  return router
}
```

**Step 4: Mount the links sub-router in `agent-board/server/src/routes/stories.ts`**

At the top, import the links router:
```typescript
import { storyLinksRouter } from './story-links.js'
```

Inside `storiesRouter`, before `return router`, add:
```typescript
router.use('/:id/links', storyLinksRouter(db, broadcast))
```

**Step 5: Include links in `GET /api/stories/:id`**

In `storiesRouter`, update the `router.get('/:id', ...)` handler. After fetching events, also fetch links:

```typescript
router.get('/:id', (req, res) => {
  const story = db.prepare('SELECT * FROM stories WHERE id = ? OR short_id = ?').get(req.params.id, req.params.id) as any
  if (!story) return res.status(404).json({ error: 'Not found' })
  const events = db.prepare("SELECT * FROM events WHERE target_id = ? AND target_type = 'story' ORDER BY created_at").all(story.id)
  const links = db.prepare('SELECT * FROM story_links WHERE from_story_id = ? OR to_story_id = ? ORDER BY created_at').all(story.id, story.id)
  res.json({ ...story, tags: JSON.parse(story.tags ?? '[]'), acceptance_criteria: JSON.parse(story.acceptance_criteria ?? '[]'), events, links })
})
```

**Step 6: Run tests to confirm they pass**

```bash
cd agent-board
npm run test --workspace=server
```

Expected: all tests pass.

**Step 7: Commit**

```bash
git add agent-board/server/src/routes/story-links.ts agent-board/server/src/routes/stories.ts agent-board/server/tests/routes.test.ts
git commit -m "feat(api): story links endpoints — POST/GET/DELETE /api/stories/:id/links"
```

---

### Task 3: Epic PATCH endpoint and epic dates

**Files:**
- Modify: `agent-board/server/src/routes/epics.ts`
- Test: `agent-board/server/tests/routes.test.ts`

**Step 1: Write failing test**

Add to `agent-board/server/tests/routes.test.ts`:

```typescript
describe('PATCH /api/epics/:id', () => {
  beforeEach(() => closeDb())
  it('updates epic start_date and end_date', async () => {
    const app = buildApp()
    const proj = await request(app).post('/api/projects').send({ key: 'RMP', name: 'Roadmap', workflow_id: 'standard' })
    const epic = await request(app).post('/api/epics').send({ project_id: proj.body.id, title: 'Epic 1' })
    const res = await request(app)
      .patch(`/api/epics/${epic.body.id}`)
      .send({ start_date: '2026-04-01', end_date: '2026-04-30' })
    expect(res.status).toBe(200)
    expect(res.body.start_date).toBe('2026-04-01')
    expect(res.body.end_date).toBe('2026-04-30')
  })
})
```

**Step 2: Run test to confirm fail**

```bash
npm run test --workspace=server
```

Expected: FAIL — no PATCH endpoint on epics.

**Step 3: Add PATCH handler to `agent-board/server/src/routes/epics.ts`**

Add before `return router`:

```typescript
router.patch('/:id', (req, res) => {
  const epic = db.prepare('SELECT * FROM epics WHERE id = ? OR short_id = ?').get(req.params.id, req.params.id) as any
  if (!epic) return res.status(404).json({ error: 'Not found' })
  const { title, description, version, status, start_date, end_date } = req.body
  db.prepare(`UPDATE epics SET
    title = COALESCE(?, title),
    description = COALESCE(?, description),
    version = COALESCE(?, version),
    status = COALESCE(?, status),
    start_date = COALESCE(?, start_date),
    end_date = COALESCE(?, end_date)
    WHERE id = ?`).run(
      title ?? null, description ?? null, version ?? null,
      status ?? null, start_date ?? null, end_date ?? null,
      epic.id
  )
  const updated = db.prepare('SELECT * FROM epics WHERE id = ?').get(epic.id)
  broadcast({ type: 'epic.updated', data: updated })
  res.json(updated)
})
```

**Step 4: Run tests**

```bash
npm run test --workspace=server
```

Expected: all pass.

**Step 5: Commit**

```bash
git add agent-board/server/src/routes/epics.ts agent-board/server/tests/routes.test.ts
git commit -m "feat(api): PATCH /api/epics/:id — update title, dates, status"
```

---

### Task 4: Register story-links router in routes/index.ts

**Files:**
- Modify: `agent-board/server/src/routes/index.ts`

The sub-router is mounted inside `storiesRouter` via `router.use('/:id/links', ...)` (Task 2, Step 4), so no change to `routes/index.ts` is needed — Express handles nested param routing via `mergeParams: true`. ✅ Skip this task.

---

### Task 5: MCP tools — link_stories and get_story_links

**Files:**
- Modify: `agent-board/mcp/src/tools/board.ts`
- Modify: `agent-board/mcp/src/index.ts`

**Step 1: Add API methods to `agent-board/mcp/src/tools/board.ts`**

Add to the `board` object:

```typescript
  linkStories: (story_id: string, data: { to_story_id: string; link_type: string }) =>
    call(`/stories/${story_id}/links`, 'POST', data),
  getStoryLinks: (story_id: string) => call(`/stories/${story_id}/links`),
  deleteStoryLink: (story_id: string, link_id: string) =>
    call(`/stories/${story_id}/links/${link_id}`, 'DELETE'),
  updateEpic: (id: string, data: object) => call(`/epics/${id}`, 'PATCH', data),
```

**Step 2: Register MCP tools in `agent-board/mcp/src/index.ts`**

Add after the existing `update_story` tool:

```typescript
server.tool(
  'link_stories',
  'Create a directional link between two stories. Use link_type "blocks" when one story must be completed before another can start — agents should call this to declare blockers before starting work.',
  {
    from_story_id: z.string().describe('Story ID or short_id of the blocking/source story'),
    to_story_id: z.string().describe('Story ID or short_id of the blocked/target story'),
    link_type: z.enum(['blocks', 'duplicates', 'relates_to']),
  },
  async ({ from_story_id, to_story_id, link_type }) => {
    const link = await board.linkStories(from_story_id, { to_story_id, link_type })
    return { content: [{ type: 'text' as const, text: JSON.stringify(link, null, 2) }] }
  }
)

server.tool(
  'get_story_links',
  'Get all links for a story — shows what it blocks, what blocks it, and duplicates. Check this before starting work on a story to identify blockers.',
  {
    story_id: z.string().describe('Story ID or short_id'),
  },
  async ({ story_id }) => {
    const links = await board.getStoryLinks(story_id)
    return { content: [{ type: 'text' as const, text: JSON.stringify(links, null, 2) }] }
  }
)
```

**Step 3: Build the MCP package**

```bash
cd agent-board
npm run build --workspace=mcp
```

Expected: `mcp/dist/index.js` updated with no TypeScript errors.

**Step 4: Commit**

```bash
git add agent-board/mcp/src/tools/board.ts agent-board/mcp/src/index.ts agent-board/mcp/dist/
git commit -m "feat(mcp): add link_stories and get_story_links tools"
```

---

## PHASE 2 — Frontend (4 tasks, run in parallel)

> All four tasks below are independent and can be implemented by separate agents simultaneously. Each touches different files. They all depend on Phase 1 being merged.

---

### Task A: Drag-and-drop Kanban board

**Files:**
- Modify: `agent-board/client/package.json` (add dep)
- Modify: `agent-board/client/src/views/BoardView.tsx`
- Modify: `agent-board/client/src/components/KanbanColumn.tsx`
- Modify: `agent-board/client/src/components/StoryCard.tsx`

**Step 1: Install @dnd-kit**

```bash
cd agent-board/client
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**Step 2: Read the current KanbanColumn and StoryCard to understand their props**

Read `agent-board/client/src/components/KanbanColumn.tsx` and `StoryCard.tsx` before touching them.

**Step 3: Wrap StoryCard as a draggable item**

In `StoryCard.tsx`, import from dnd-kit and wrap the card's root element:

```typescript
import { useDraggable } from '@dnd-kit/core'

// Inside the component, before the return:
const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
  id: story.id,
  data: { story },
})

const style = transform ? {
  transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  opacity: isDragging ? 0.5 : 1,
  zIndex: isDragging ? 50 : undefined,
} : undefined
```

Apply `ref={setNodeRef}`, `style={style}`, and spread `{...listeners} {...attributes}` onto the card's root `<div>`.

**Step 4: Make KanbanColumn a drop target**

In `KanbanColumn.tsx`:

```typescript
import { useDroppable } from '@dnd-kit/core'

// Inside the component:
const { setNodeRef, isOver } = useDroppable({ id: state.id })
```

Apply `ref={setNodeRef}` to the column's card-list container. Add a visual highlight when `isOver`:

```typescript
className={`... ${isOver ? 'bg-blue-50 ring-2 ring-blue-200 ring-inset' : ''}`}
```

**Step 5: Wire up DndContext in BoardView**

In `BoardView.tsx`, import and wrap the board:

```typescript
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
```

Add mutation:

```typescript
const queryClient = useQueryClient()
const moveMutation = useMutation({
  mutationFn: ({ storyId, status }: { storyId: string; status: string }) =>
    api.stories.moveStatus(storyId, status),
  onMutate: async ({ storyId, status }) => {
    // Optimistic update
    await queryClient.cancelQueries({ queryKey: ['stories', projectId] })
    const prev = queryClient.getQueryData(['stories', projectId])
    queryClient.setQueryData(['stories', projectId], (old: any[]) =>
      old.map(s => s.id === storyId ? { ...s, status } : s)
    )
    return { prev }
  },
  onError: (_err, _vars, ctx) => {
    queryClient.setQueryData(['stories', projectId], ctx?.prev)
  },
})

function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event
  if (!over || active.id === over.id) return
  const story = typedStories.find(s => s.id === active.id)
  if (!story || story.status === over.id) return
  moveMutation.mutate({ storyId: story.id as string, status: over.id as string })
}
```

Wrap the board columns with `<DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>`.

**Step 6: Test manually**

Start the dev server:
```bash
cd agent-board
npm run dev:server --workspace=server &
npm run dev:client --workspace=client
```

Open `http://localhost:5173`, go to a project board, and drag a card between columns. Verify:
- Card follows the cursor
- Column highlights on hover
- Card moves to new column on drop
- Status is persisted (refresh the page — card should stay in new column)

**Step 7: Commit**

```bash
git add agent-board/client/
git commit -m "feat(ui): drag-and-drop Kanban — move cards between columns with @dnd-kit"
```

---

### Task B: Swimlanes

**Files:**
- Modify: `agent-board/client/src/views/BoardView.tsx`

**Step 1: Read BoardView.tsx carefully** before editing. Understand the existing toolbar and column rendering.

**Step 2: Add swimlane state and grouping logic**

Add swimlane type and state inside `BoardView`:

```typescript
type Swimlane = 'none' | 'epic' | 'assignee' | 'priority'
const [swimlane, setSwimlane] = useState<Swimlane>('none')
```

Add a helper to group stories:

```typescript
function groupBy(stories: Story[], swimlane: Swimlane): Array<{ key: string; label: string; stories: Story[] }> {
  if (swimlane === 'none') return [{ key: 'all', label: '', stories }]
  if (swimlane === 'priority') {
    const priorities = ['high', 'medium', 'low']
    return priorities.map(p => ({
      key: p,
      label: p.charAt(0).toUpperCase() + p.slice(1) + ' Priority',
      stories: stories.filter(s => s.priority === p),
    })).filter(g => g.stories.length > 0)
  }
  if (swimlane === 'assignee') {
    const assigned = stories.filter(s => s.assigned_agent_id)
    const unassigned = stories.filter(s => !s.assigned_agent_id)
    const agentGroups = typedAgents
      .map(a => ({
        key: a.id,
        label: `${a.avatar_emoji} ${a.name}`,
        stories: assigned.filter(s => s.assigned_agent_id === a.id),
      }))
      .filter(g => g.stories.length > 0)
    return [
      ...agentGroups,
      ...(unassigned.length > 0 ? [{ key: 'unassigned', label: 'Unassigned', stories: unassigned }] : []),
    ]
  }
  if (swimlane === 'epic') {
    // Need feature → epic lookup
    const featureToEpic: Record<string, Epic> = {}
    // This requires features data — add a features query to BoardView
    // See step below
    const epicGroups = typedEpics.map(e => ({
      key: e.id,
      label: `${e.short_id ?? ''} ${e.title}`,
      stories: stories.filter(s => featureToEpic[s.feature_id]?.id === e.id),
    })).filter(g => g.stories.length > 0)
    const noEpic = stories.filter(s => !featureToEpic[s.feature_id])
    return [
      ...epicGroups,
      ...(noEpic.length > 0 ? [{ key: 'no-epic', label: 'No Epic', stories: noEpic }] : []),
    ]
  }
  return [{ key: 'all', label: '', stories }]
}
```

For epic swimlane, add a features query to `BoardView`:

```typescript
const { data: features = [] } = useQuery({
  queryKey: ['features'],
  queryFn: () => api.features.listAll(),
})
// Build feature → epic lookup
const featureToEpic = Object.fromEntries(
  (features as Feature[]).map(f => [f.id, typedEpics.find(e => e.id === f.epic_id)])
)
```

**Step 3: Add swimlane toggle to toolbar**

In the toolbar `<div>`, after the Board/List toggle buttons, add:

```tsx
<div className="flex items-center gap-1 ml-4 border-l pl-4">
  <span className="text-xs text-slate-400">Group by:</span>
  {(['none', 'epic', 'assignee', 'priority'] as Swimlane[]).map(s => (
    <button key={s} onClick={() => setSwimlane(s)}
      className={`px-2 py-1 text-xs rounded capitalize transition-colors ${
        swimlane === s ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-500 hover:text-slate-700'
      }`}>
      {s === 'none' ? 'None' : s}
    </button>
  ))}
</div>
```

**Step 4: Render swimlanes in board view**

Replace the existing column rendering with grouped rendering:

```tsx
const groups = groupBy(filteredStories, swimlane)

// Inside the board view return:
<div className="flex-1 overflow-auto">
  {groups.map(group => (
    <div key={group.key}>
      {swimlane !== 'none' && (
        <div className="px-6 pt-4 pb-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{group.label}</span>
        </div>
      )}
      <div className="flex gap-5 px-6 pb-6 min-w-max items-start">
        {workflow.states.map(state => (
          <KanbanColumn
            key={`${group.key}-${state.id}`}
            state={state}
            stories={group.stories.filter(s => s.status === state.id)}
            agents={typedAgents}
            onCardClick={handleStoryClick}
          />
        ))}
      </div>
    </div>
  ))}
</div>
```

**Step 5: Manual test**

Visit the board, toggle swimlanes, verify grouping is correct for each option.

**Step 6: Commit**

```bash
git add agent-board/client/src/views/BoardView.tsx
git commit -m "feat(ui): swimlanes — group Kanban board by epic, assignee, or priority"
```

---

### Task C: Issue links UI on story detail

**Files:**
- Modify: `agent-board/client/src/lib/api.ts` (add StoryLink type + API methods)
- Modify: `agent-board/client/src/views/StoryDetailView.tsx`
- Modify: `agent-board/client/src/components/StoryCard.tsx` (blocker badge)

**Step 1: Read StoryDetailView.tsx** to understand its full structure before editing.

**Step 2: Add StoryLink type and API methods to `agent-board/client/src/lib/api.ts`**

Add to the interfaces at the bottom:

```typescript
export interface StoryLink {
  id: string
  from_story_id: string
  to_story_id: string
  link_type: 'blocks' | 'duplicates' | 'relates_to'
  created_at: string
}
```

Add to the `Story` interface — links come back in `GET /api/stories/:id`:

```typescript
// In the Story interface, add:
links?: StoryLink[]
```

Add to `api.stories`:

```typescript
    links: {
      list: (story_id: string) => request<StoryLink[]>(`/stories/${story_id}/links`),
      create: (story_id: string, data: { to_story_id: string; link_type: string }) =>
        request<StoryLink>(`/stories/${story_id}/links`, { method: 'POST', body: JSON.stringify(data) }),
      delete: (story_id: string, link_id: string) =>
        request<void>(`/stories/${story_id}/links/${link_id}`, { method: 'DELETE' }),
    },
```

**Step 3: Add "Linked Issues" section to StoryDetailView**

Read `agent-board/client/src/views/StoryDetailView.tsx` first to understand the layout.

Add a `LinkedIssues` section. The story detail already fetches the story including links (Phase 1 added links to `GET /api/stories/:id`). Use TanStack Query's mutation for creating/deleting links and invalidate the story query on success.

Key UI elements:
- Section header: "Linked Issues"
- Group links by relationship label: "Blocks", "Blocked by", "Duplicates", "Relates to"
- For each link, show the linked story's `short_id` and `title` (you'll need to fetch the linked story or resolve from a stories list)
- "Add link" button → small inline form: text input (search by short_id or title) + link type select + confirm
- Delete (×) button on each link

For resolving the linked story's title without an extra fetch per link, fetch all project stories (already available in many views) and do a client-side lookup by ID.

```tsx
// Group links by human label
function groupLinks(links: StoryLink[], storyId: string) {
  return {
    blocks: links.filter(l => l.link_type === 'blocks' && l.from_story_id === storyId),
    blocked_by: links.filter(l => l.link_type === 'blocks' && l.to_story_id === storyId),
    duplicates: links.filter(l => l.link_type === 'duplicates'),
    relates_to: links.filter(l => l.link_type === 'relates_to'),
  }
}
```

**Step 4: Add blocker badge to StoryCard**

In `agent-board/client/src/components/StoryCard.tsx`, accept an optional `hasBlockers` prop. When true, show a small red indicator:

```tsx
interface Props {
  story: Story
  agent?: Agent
  onClick?: () => void
  hasBlockers?: boolean
}

// Inside the card, add a small badge:
{hasBlockers && (
  <span title="Blocked" className="text-[10px] text-red-500 font-mono">⛔</span>
)}
```

In `BoardView.tsx` and wherever `StoryCard` is rendered, compute `hasBlockers`:

```typescript
// stories that have a link where they are the to_story_id and link_type === 'blocks'
// Since we don't fetch all links on the board view, this requires either:
// a) fetching links separately, or
// b) deriving from the story.links field (only present in GET /api/stories/:id, not the list endpoint)
// 
// Simplest approach: add a server-side computed field `blocked` (boolean) to the story list response.
// OR: skip the board-level badge for now — only show it in story detail.
// 
// Recommended: show the badge only on the story detail, not the board cards, to avoid N+1 fetches.
// The board card can show a generic 🔗 icon if story.links?.length > 0 (from cached data).
```

For the board cards, only show a 🔗 badge if `story.links && story.links.length > 0`. Since the story list endpoint doesn't return links, this badge will only appear for stories that have been individually fetched (e.g., recently viewed). This is acceptable for now.

**Step 5: Manual test**

- Open a story detail
- Add a "blocks" link to another story
- Verify the link appears grouped under "Blocks"
- Delete the link
- Verify it disappears

**Step 6: Commit**

```bash
git add agent-board/client/src/lib/api.ts agent-board/client/src/views/StoryDetailView.tsx agent-board/client/src/components/StoryCard.tsx
git commit -m "feat(ui): issue links — add/remove story links in story detail view"
```

---

### Task D: Roadmap view

**Files:**
- Modify: `agent-board/client/src/lib/api.ts` (update Epic type)
- Create: `agent-board/client/src/views/RoadmapView.tsx`
- Modify: `agent-board/client/src/components/Sidebar.tsx` (add nav item)
- Modify: `agent-board/client/src/App.tsx` (add route)

**Step 1: Read App.tsx and Sidebar.tsx** to understand routing and navigation patterns.

**Step 2: Update `Epic` type in `api.ts`**

Add `start_date` and `end_date` to the Epic interface:

```typescript
export interface Epic {
  id: string; project_id: string; title: string; description?: string;
  version?: string; status: string; created_at: string; short_id?: string;
  start_date?: string; end_date?: string
}
```

Add `update` to `api.epics`:

```typescript
    update: (id: string, data: Partial<Epic>) =>
      request<Epic>(`/epics/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
```

**Step 3: Create `agent-board/client/src/views/RoadmapView.tsx`**

The roadmap is a Gantt-style timeline:
- X axis: dates (current quarter by default)
- Y axis: one row per epic
- Each epic renders as a horizontal bar spanning `start_date` → `end_date`
- Epics without dates render as a dot at the left edge with a label
- Clicking an epic navigates to its detail view
- Toolbar: `<` prev quarter / current quarter label / `>` next quarter, plus a date range picker

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Epic } from '@/lib/api'
import { ChevronLeft, ChevronRight } from 'lucide-react'

function getQuarter(date: Date) {
  const q = Math.floor(date.getMonth() / 3)
  const start = new Date(date.getFullYear(), q * 3, 1)
  const end = new Date(date.getFullYear(), q * 3 + 3, 0)
  return { start, end, label: `Q${q + 1} ${date.getFullYear()}` }
}

function dateToX(date: Date, rangeStart: Date, rangeEnd: Date, width: number): number {
  const total = rangeEnd.getTime() - rangeStart.getTime()
  const offset = Math.max(0, date.getTime() - rangeStart.getTime())
  return Math.min(width, (offset / total) * width)
}

interface Props { projectId: string }

export function RoadmapView({ projectId }: Props) {
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [quarterOffset, setQuarterOffset] = useState(0)
  const now = new Date()
  const refDate = new Date(now.getFullYear(), now.getMonth() + quarterOffset * 3, 1)
  const { start: rangeStart, end: rangeEnd, label: quarterLabel } = getQuarter(refDate)

  const { data: epics = [] } = useQuery({
    queryKey: ['epics', projectId],
    queryFn: () => api.epics.list(projectId),
    enabled: !!projectId,
  })

  const updateEpic = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Epic> }) => api.epics.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['epics', projectId] }),
  })

  const TRACK_WIDTH = 800
  const ROW_HEIGHT = 44

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <button onClick={() => setQuarterOffset(q => q - 1)} className="p-1 hover:bg-slate-100 rounded">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium text-slate-700 w-24 text-center">{quarterLabel}</span>
        <button onClick={() => setQuarterOffset(q => q + 1)} className="p-1 hover:bg-slate-100 rounded">
          <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={() => setQuarterOffset(0)} className="text-xs text-slate-400 hover:text-slate-600 ml-2">Today</button>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-auto p-6">
        <div className="flex">
          {/* Epic labels */}
          <div className="w-48 flex-shrink-0">
            <div className="h-8" /> {/* header spacer */}
            {(epics as Epic[]).map(epic => (
              <div key={epic.id} style={{ height: ROW_HEIGHT }}
                className="flex items-center pr-4 border-b border-slate-100">
                <button
                  onClick={() => navigate(`/${projectKey}/epics/${epic.short_id ?? epic.id}`)}
                  className="text-xs text-slate-700 font-medium hover:text-blue-600 truncate text-left"
                >
                  <span className="text-slate-400 font-mono mr-1">{epic.short_id}</span>
                  {epic.title}
                </button>
              </div>
            ))}
          </div>

          {/* Gantt chart */}
          <div className="flex-1 overflow-x-auto">
            {/* Date header */}
            <div className="h-8 flex items-end pb-1 border-b border-slate-200">
              {/* Render month markers */}
              {Array.from({ length: 3 }).map((_, i) => {
                const month = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + i, 1)
                const x = dateToX(month, rangeStart, rangeEnd, TRACK_WIDTH)
                return (
                  <div key={i} className="absolute text-[10px] text-slate-400" style={{ left: x }}>
                    {month.toLocaleString('default', { month: 'short' })}
                  </div>
                )
              })}
            </div>

            {/* Epic rows */}
            <svg width={TRACK_WIDTH} height={(epics as Epic[]).length * ROW_HEIGHT}>
              {/* Today line */}
              {(() => {
                const todayX = dateToX(new Date(), rangeStart, rangeEnd, TRACK_WIDTH)
                return todayX > 0 && todayX < TRACK_WIDTH ? (
                  <line x1={todayX} y1={0} x2={todayX} y2={(epics as Epic[]).length * ROW_HEIGHT}
                    stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 2" />
                ) : null
              })()}

              {(epics as Epic[]).map((epic, i) => {
                const y = i * ROW_HEIGHT + ROW_HEIGHT / 2
                if (!epic.start_date || !epic.end_date) {
                  // No dates — render a dot
                  return (
                    <g key={epic.id}>
                      <circle cx={12} cy={y} r={5} fill="#94a3b8" />
                      <text x={22} y={y + 4} fontSize={11} fill="#64748b">(no dates)</text>
                    </g>
                  )
                }
                const x1 = dateToX(new Date(epic.start_date), rangeStart, rangeEnd, TRACK_WIDTH)
                const x2 = dateToX(new Date(epic.end_date), rangeStart, rangeEnd, TRACK_WIDTH)
                const barWidth = Math.max(4, x2 - x1)
                return (
                  <g key={epic.id} style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/${projectKey}/epics/${epic.short_id ?? epic.id}`)}>
                    <rect x={x1} y={y - 10} width={barWidth} height={20} rx={4}
                      fill="#6366f1" fillOpacity={0.85} />
                    {barWidth > 40 && (
                      <text x={x1 + 6} y={y + 4} fontSize={10} fill="white" style={{ pointerEvents: 'none' }}>
                        {epic.title.slice(0, Math.floor(barWidth / 7))}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>

        {/* Inline date editing instructions */}
        <p className="text-xs text-slate-400 mt-4">
          To set epic dates, open the epic detail and edit start/end dates there.
        </p>
      </div>
    </div>
  )
}
```

Note: inline drag-to-resize bars is complex — defer to a future iteration. For now, dates are set via epic detail (which gets a start/end date input from the PATCH endpoint added in Phase 1).

**Step 4: Add start_date / end_date inputs to EpicDetailView**

Read `agent-board/client/src/views/EpicDetailView.tsx`. Add two date inputs that call `api.epics.update` on change, placed in the epic header area.

**Step 5: Add Roadmap to sidebar**

In `agent-board/client/src/components/Sidebar.tsx`, import the `Map` icon from lucide-react and add after the Epics nav link:

```tsx
import { LayoutDashboard, List, BookOpen, Users, Plus, Map } from 'lucide-react'

// Inside the project views section:
<NavLink to={`/${project.key}/roadmap`} className={navLinkClass}>
  <Map className="w-3.5 h-3.5" />
  Roadmap
</NavLink>
```

**Step 6: Add route in App.tsx**

Read `agent-board/client/src/App.tsx`. Add the roadmap route alongside the existing board/backlog/epics routes, passing `projectId` the same way those views receive it.

**Step 7: Manual test**

- Navigate to Roadmap for a project
- Verify epics without dates show as dots
- Set start/end dates on an epic via its detail view
- Return to Roadmap — verify the bar appears in the correct position
- Navigate between quarters

**Step 8: Commit**

```bash
git add agent-board/client/src/
git commit -m "feat(ui): roadmap — epic timeline Gantt view with quarter navigation"
```

---

## Final Steps

After all Phase 2 tasks are merged:

**Step 1: Build and smoke-test production**

```bash
cd agent-board
npm run build
npm run start --workspace=server
```

Open `http://localhost:3000` and verify all four features work in the production build.

**Step 2: Update CLAUDE.md** to mention the new MCP tools (`link_stories`, `get_story_links`) and the Roadmap view.

**Step 3: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with new MCP tools and Roadmap view"
```
