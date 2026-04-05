---
project: BOARD
type: implementation-plan
---

# UI Fluidity & Homogeneity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make navigation fluid and consistent — epics list is clean, all entity IDs use short_ids in URLs, every doc has its own URL, and agent avatars/ID badges are clickable in display contexts.

**Architecture:** Pure frontend changes. Four focused areas: (1) EpicsView list style, (2) epic short_id URL routing, (3) docs per-doc URL routing, (4) clickable agent avatars and ID badges in display contexts. No backend schema changes needed — the server already supports lookup by `id OR short_id`.

**Tech Stack:** React + React Router v6 + TanStack Query + TypeScript + Tailwind CSS

---

## Context

Key files and what they do:
- `client/src/App.tsx` — React Router route definitions
- `client/src/views/EpicsView.tsx` — epics list page
- `client/src/views/EpicDetailView.tsx` — epic detail page (already works with short_id via server)
- `client/src/views/DocsView.tsx` — doc viewer (uses component state to track selected doc, no URL)
- `client/src/views/StoryDetailView.tsx` — story detail (line 206: epic link uses UUID)
- `client/src/views/FeatureDetailView.tsx` — feature detail (lines 55/64: epic links use UUID; line 130: agent emoji not clickable; line 108: story navigates by UUID)
- `client/src/views/BacklogView.tsx` — backlog (line 110: agent emoji display, not clickable)
- `client/src/views/BoardView.tsx` — board (line 242: agent name/emoji in cards, not clickable)
- `client/src/components/FilterBar.tsx` — agent avatar pills used as filter toggles (DO NOT add navigation here)

Type reference from `client/src/lib/api.ts`:
```ts
interface Epic { id: string; project_id: string; title: string; description?: string; version?: string; status: string; created_at: string; short_id?: string; ... }
interface Feature { id: string; epic_id: string; title: string; description?: string; tags: string[]; created_at: string; short_id?: string }
interface Story { id: string; feature_id: string; title: string; ...; short_id?: string }
interface Agent { id: string; slug: string; name: string; color: string; avatar_emoji: string; skills: AgentSkill[] }
```

Build command (run from `agent-board/client/`): `npm run build`
Dev server: `npm run dev` (from `agent-board/client/`)

---

### Task 1: Clean epics list — remove description, add short_id badge

**Files:**
- Modify: `client/src/views/EpicsView.tsx`

The current list shows a card with title + 2-line description preview. Replace with a clean single-line row matching the backlog style: short_id badge on the left, title in the middle, status badge on the right.

**Step 1: Replace the card layout in EpicsView.tsx**

Find the `<button>` card element (the one inside `typedEpics.map(epic => ...)`) and replace its content:

```tsx
<button
  key={epic.id}
  onClick={() => navigate(`/${paramKey ?? ''}/epics/${epic.short_id ?? epic.id}`)}
  className="text-left w-full px-4 py-3 bg-white border-b border-slate-100 hover:bg-slate-50 transition-colors flex items-center gap-3"
>
  {epic.short_id && (
    <span className="text-xs font-mono text-slate-400 flex-shrink-0 w-20">{epic.short_id}</span>
  )}
  <span className="flex-1 text-sm text-slate-800 truncate">{epic.title}</span>
  <StatusBadge status={epic.status} />
</button>
```

Also change the container from `<div className="grid gap-3">` to `<div className="divide-y divide-slate-100 bg-white rounded-lg border border-slate-200 overflow-hidden">`.

**Step 2: Verify no TypeScript errors**

Run from `agent-board/client/`:
```bash
npm run build 2>&1 | tail -20
```
Expected: build succeeds with no errors.

**Step 3: Commit**

```bash
git add client/src/views/EpicsView.tsx
git commit -m "feat: clean epics list — single-line rows, no description preview"
```

---

### Task 2: Epic short_id URL — fix all navigate() calls

**Files:**
- Modify: `client/src/views/StoryDetailView.tsx` (line ~206)
- Modify: `client/src/views/FeatureDetailView.tsx` (lines ~55 and ~64)

Currently, both views navigate to epics using the UUID (`epic.id`). The server already supports lookup by `short_id`, so we just need to change the client URLs.

**Step 1: Fix StoryDetailView.tsx**

Find (around line 206):
```tsx
onClick={() => navigate(`/${projectKey}/epics/${epic.id}`)}
```
Replace with:
```tsx
onClick={() => navigate(`/${projectKey}/epics/${epic.short_id ?? epic.id}`)}
```

**Step 2: Fix FeatureDetailView.tsx — both navigate calls**

Find (around line 55, the back button):
```tsx
onClick={() => typedEpic ? navigate(`/${projectKey}/epics/${typedEpic.id}`) : navigate(-1)}
```
Replace with:
```tsx
onClick={() => typedEpic ? navigate(`/${projectKey}/epics/${typedEpic.short_id ?? typedEpic.id}`) : navigate(-1)}
```

Find (around line 64, the breadcrumb):
```tsx
onClick={() => navigate(`/${projectKey}/epics/${typedEpic.id}`)}
```
Replace with:
```tsx
onClick={() => navigate(`/${projectKey}/epics/${typedEpic.short_id ?? typedEpic.id}`)}
```

**Step 3: Verify no TypeScript errors**

```bash
npm run build 2>&1 | tail -20
```

**Step 4: Commit**

```bash
git add client/src/views/StoryDetailView.tsx client/src/views/FeatureDetailView.tsx
git commit -m "feat: use short_id in epic URLs instead of UUID"
```

---

### Task 3: Docs per-doc URL routing

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/views/DocsView.tsx`

Currently all docs open at `/BOARD/docs` with state-based doc selection. We want `/BOARD/docs/:docSlug` where `docSlug` is the filename without `.md`.

**Step 1: Add route in App.tsx**

In `App.tsx`, find the existing docs routes:
```tsx
<Route path="/docs" element={<DocsView />} />
<Route path="/:projectKey/docs" element={<ProjectDocsRoute />} />
```

Add a new route after `/:projectKey/docs`:
```tsx
<Route path="/:projectKey/docs/:docSlug" element={<ProjectDocsRoute />} />
```

`ProjectDocsRoute` already passes `projectKey` to `DocsView` — it will also pick up `docSlug` from params inside `DocsView`.

**Step 2: Update DocsView.tsx to read and write URL params**

At the top of `DocsView`, add the import:
```tsx
import { useNavigate, useParams } from 'react-router-dom'
```

Inside `DocsView`, replace the `useState` for `selected` with URL-driven state:

```tsx
export function DocsView({ projectKey }: DocsViewProps) {
  const { docSlug } = useParams<{ docSlug?: string }>()
  const navigate = useNavigate()
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

  // Derive selected file from URL slug + loaded file list
  const selectedFromSlug = (files as string[]).find(f => {
    const name = f.split('/').pop()?.replace(/\.md$/, '')
    return name === docSlug
  }) ?? null

  const selected = selectedFromSlug
```

Remove the old `const [selected, setSelected] = useState<string | null>(null)` line.

Update the `setSelected(f)` call in the sidebar button to navigate instead:
```tsx
onClick={() => {
  const slug = f.split('/').pop()!.replace(/\.md$/, '')
  navigate(`/${projectKey}/docs/${slug}`)
}}
```

Note: `handleSync` uses `selected` — keep that reference working (it now reads from `selectedFromSlug`).

The `useQuery` for `files` needs to be declared before `selectedFromSlug`. Move the files query above the slug derivation. The final structure should be:

```tsx
export function DocsView({ projectKey }: DocsViewProps) {
  const { docSlug } = useParams<{ docSlug?: string }>()
  const navigate = useNavigate()
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

  const { data: files = [] } = useQuery({
    queryKey: ['docs', projectKey],
    queryFn: () => fetchDocList(projectKey),
  })

  const selected = (files as string[]).find(f => {
    const name = f.split('/').pop()?.replace(/\.md$/, '')
    return name === docSlug
  }) ?? null

  const { data: content, isLoading } = useQuery({
    queryKey: ['doc', selected],
    queryFn: () => fetchDocContent(selected!),
    enabled: !!selected,
  })

  // handleSync uses selected
  const handleSync = async () => {
    if (!selected) return
    // ... rest unchanged
  }

  const grouped = (files as string[]).reduce<Record<string, string[]>>((acc, f) => {
    // ... unchanged
  }, {})

  return (
    // ... in sidebar button:
    // onClick={() => { const slug = f.split('/').pop()!.replace(/\.md$/, ''); navigate(`/${projectKey}/docs/${slug}`) }}
    // active state: selected === f  (now URL-driven)
  )
}
```

**Step 3: Verify no TypeScript errors**

```bash
npm run build 2>&1 | tail -20
```

**Step 4: Commit**

```bash
git add client/src/App.tsx client/src/views/DocsView.tsx
git commit -m "feat: per-doc URL routing — /projectKey/docs/docSlug"
```

---

### Task 4: Clickable agent avatars in display contexts

**Files:**
- Modify: `client/src/views/FeatureDetailView.tsx` (line ~130, agent emoji in story rows)
- Modify: `client/src/views/BacklogView.tsx` (line ~110, agent emoji in backlog rows)
- Modify: `client/src/views/BoardView.tsx` (line ~242, agent name in board cards)
- **Do NOT touch:** `client/src/components/FilterBar.tsx` (agent pills are filter toggles)

**Step 1: FeatureDetailView — make agent emoji clickable in story rows**

Find (around line 128-132):
```tsx
{agent && <span title={agent.name} className="flex-shrink-0">{agent.avatar_emoji}</span>}
```

Replace with:
```tsx
{agent && (
  <button
    onClick={e => { e.stopPropagation(); navigate(`/team/${agent.slug}`) }}
    title={agent.name}
    className="flex-shrink-0 hover:opacity-70 transition-opacity"
  >
    {agent.avatar_emoji}
  </button>
)}
```

Note: `e.stopPropagation()` prevents the parent story row click from also firing.

**Step 2: FeatureDetailView — also fix story navigation to use short_id**

While in this file, find (around line 108):
```tsx
onClick={() => navigate(`/${projectKey}/stories/${story.id}`)}
```
Replace with:
```tsx
onClick={() => navigate(`/${projectKey}/stories/${story.short_id ?? story.id}`)}
```

**Step 3: BacklogView — make agent emoji in rows clickable**

In `BacklogView.tsx`, first add `useNavigate` to the import:
```tsx
import { useNavigate } from 'react-router-dom'
```
Add inside the component:
```tsx
const navigate = useNavigate()
```

Find (around line 110):
```tsx
{agent && <span title={agent.name} className="flex-shrink-0">{agent.avatar_emoji}</span>}
```
Replace with:
```tsx
{agent && (
  <button
    onClick={e => { e.stopPropagation(); navigate(`/team/${agent.slug}`) }}
    title={agent.name}
    className="flex-shrink-0 hover:opacity-70 transition-opacity"
  >
    {agent.avatar_emoji}
  </button>
)}
```

**Step 4: BoardView — make agent display in cards clickable**

In `BoardView.tsx`, find the card agent display (around line 242):
```tsx
{agent ? `${agent.avatar_emoji} ${agent.name}` : '—'}
```

This is inside a `<div>` or `<span>`. Wrap the agent display in a button:
```tsx
{agent ? (
  <button
    onClick={e => { e.stopPropagation(); navigate(`/team/${agent.slug}`) }}
    className="hover:underline hover:text-slate-900 transition-colors text-left"
    title={`Go to ${agent.name}'s profile`}
  >
    {agent.avatar_emoji} {agent.name}
  </button>
) : '—'}
```

Note: `navigate` is already imported and used in `BoardView.tsx` (line 19).

**Step 5: Verify no TypeScript errors**

```bash
npm run build 2>&1 | tail -20
```

**Step 6: Commit**

```bash
git add client/src/views/FeatureDetailView.tsx client/src/views/BacklogView.tsx client/src/views/BoardView.tsx
git commit -m "feat: clickable agent avatars in display contexts — navigate to agent profile"
```

---

### Task 5: Smoke test in browser

Start the dev server and verify each change:

```bash
cd agent-board/client && npm run dev
```

Checklist:
- [ ] `/BOARD/epics` — list shows short_id badges + title + status, no description text
- [ ] Click an epic → URL changes to `/BOARD/epics/BOARD-E1` (not UUID)
- [ ] From a story detail, click the epic breadcrumb → goes to `/BOARD/epics/BOARD-E1`
- [ ] From a feature detail, click the epic back button/breadcrumb → goes to `/BOARD/epics/BOARD-E1`
- [ ] Click a doc in the sidebar → URL changes to `/BOARD/docs/2026-04-01-agent-board-design`
- [ ] Reload that URL → doc is auto-selected and displayed
- [ ] In feature detail story rows, click agent emoji → navigates to `/team/agentSlug`
- [ ] In backlog rows, click agent emoji → navigates to `/team/agentSlug`
- [ ] In board cards, click agent name → navigates to `/team/agentSlug`
- [ ] In FilterBar (backlog/board toolbar), clicking agent pill still filters (no navigation)
