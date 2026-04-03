# Agent Board v2 — Design Document

**Date:** 2026-04-02  
**Status:** Approved

## Overview

Evolve the agent board from a simple kanban view into a full Jira-like application. The primary gaps: no dedicated pages for epics/stories/agents/team, no filtering, no in-app content creation, and a project-selection persistence bug. This design addresses all of them.

---

## Architecture Changes

### Routing (new)

Add `react-router-dom` v6. Project key lives in the URL — this also solves the persistence bug with no localStorage needed.

```
/                          → Project list / selector
/:projectKey               → Redirect → /:projectKey/board
/:projectKey/board         → Kanban board (active sprint)
/:projectKey/backlog       → Backlog with filter bar
/:projectKey/epics         → Epics list
/:projectKey/epics/:epicId → Epic detail page
/:projectKey/stories/:storyId → Story detail page
/team                      → Team page (all agents)
/team/:agentSlug           → Agent profile page
```

### Layout

Replace top header nav with a **left sidebar** (Jira-style):
- Project key + name at top
- Nav: Board, Backlog, Epics, Team
- Global "+ Create" button

---

## Data Model Additions

Two new columns, added via SQL migration on server start:

| Table | Column | Type | Content |
|-------|--------|------|---------|
| `stories` | `acceptance_criteria` | TEXT | JSON array of `{id, text, checked}` |
| `agents` | `skills` | TEXT | JSON array of superpowers skill names |

Pre-populate `agents.skills` from the existing seed mapping:
- `tess-ter` → `["test-driven-development"]`
- `arch-lee` → `["brainstorming", "writing-plans"]`
- `deb-ugg` → `["systematic-debugging"]`
- `rev-yu` → `["requesting-code-review", "receiving-code-review"]`
- `dee-ploy` → `["finishing-a-development-branch"]`
- `dev-in` → `["executing-plans"]`
- `fron-tina` → `["frontend-design", "executing-plans"]`
- `doc-tor` → `["doc-coauthoring"]`

---

## New Backend Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/agents/:slug` | Single agent by slug |
| `GET` | `/agents/:slug/stories` | Stories assigned to agent |
| `PATCH` | `/stories/:id` | Extended to include `acceptance_criteria` |

All existing endpoints unchanged.

---

## New Pages

### Epic Detail (`/:projectKey/epics/:epicId`)

- Epic title, description, version badge, status
- Features listed as collapsible sections, each showing child stories
- Each story row: title, status badge, assignee avatar, priority dot
- Story count progress per feature (X/Y done)
- Add story inline per feature

### Story Detail (`/:projectKey/stories/:storyId`)

Two-column layout:

**Left column:**
- Title (inline editable)
- Breadcrumb: Epic › Feature
- Description (inline editable)
- Acceptance Criteria — checklist (`☑ / ☐`), addable/removable items
- Subtasks (TDD sub-stories, if any)
- Activity feed (all events)

**Right panel:**
- Status dropdown (with valid transitions)
- Assignee picker
- Priority selector
- Labels/tags
- Story points (estimated_minutes ÷ 60, displayed as points)
- Parent epic link
- Linked work items (relates-to / implements)

### Team Page (`/team`)

Grid of agent cards: emoji, name, scope/role, color indicator, active story count. Click → agent profile.

### Agent Profile (`/team/:agentSlug`)

- Header: emoji avatar, name, scope
- Superpowers skills list (pill badges)
- Two columns: "In Progress" stories | "Recently Done" stories (last 10)
- Activity feed (last 20 events by this agent)

---

## Filters

Filter bar in Board and Backlog views:

```
[Assignee ▾] [Label ▾] [Priority ▾] [Epic ▾]   Clear filters
```

- **Assignee:** avatar pills, multi-select
- **Label/Tags:** multi-select dropdown
- **Priority:** multi-select (High / Medium / Low)
- **Epic:** single-select dropdown

Filters are applied client-side. No new API endpoints needed — all data is already fetched.

**Backlog view grouping:** Stories grouped by Epic, each group collapsible. Sprint label shown per story.

---

## In-App Creation UI

Global "+ Create" button in sidebar opens a modal with type selector:

| Type | Fields |
|------|--------|
| Epic | Title, description, version |
| Feature | Epic selector, title, description, tags |
| Story | Feature selector, title, description, priority, assignee, estimated minutes, initial acceptance criteria |

Calls existing REST endpoints (`POST /epics`, `POST /features`, `POST /stories`). React Query cache invalidation triggers real-time update across all views.

---

## MCP Changes

New tool: `update_story(story_id, fields)` — agents can update title, description, acceptance_criteria, assigned_agent_id from Claude Code.

```typescript
// fields type
{
  title?: string
  description?: string
  acceptance_criteria?: Array<{ id: string; text: string; checked: boolean }>
  assigned_agent_id?: string
  priority?: string
  tags?: string[]
  estimated_minutes?: number
}
```

---

## Implementation Phases

### Phase 1: Foundation
1. Add `react-router-dom` v6 — restructure `App.tsx` into `Router` + `Layout` + route components
2. Add left sidebar with project-aware navigation
3. SQL migration for `acceptance_criteria` + `agents.skills`
4. New backend endpoints (`GET /agents/:slug`, `GET /agents/:slug/stories`)
5. Extend `PATCH /stories/:id` for acceptance_criteria

### Phase 2: Detail Pages
6. Epic detail page
7. Story detail page (with inline edit + acceptance criteria checklist)
8. Team page
9. Agent profile page

### Phase 3: Filters & Creation
10. Filter bar component (Board + Backlog)
11. In-app Create modal (Epic / Feature / Story forms)
12. MCP `update_story` tool

---

## Key Files to Modify

| File | Change |
|------|--------|
| `client/package.json` | Add `react-router-dom` |
| `client/src/main.tsx` | Wrap app in `<BrowserRouter>` |
| `client/src/App.tsx` | Replace with Layout + route definitions |
| `client/src/views/BoardView.tsx` | Add filter bar, use URL params |
| `client/src/lib/api.ts` | Add new API calls |
| `server/src/db/schema.ts` | Add new columns (migration) |
| `server/src/db/seed.ts` | Populate agents.skills |
| `server/src/routes/agents.ts` | Add `/agents/:slug` and `/agents/:slug/stories` |
| `server/src/routes/stories.ts` | Extend PATCH to include acceptance_criteria |
| `mcp/src/index.ts` | Add `update_story` tool |

**New files:**
- `client/src/views/EpicsView.tsx`
- `client/src/views/EpicDetailView.tsx`
- `client/src/views/StoryDetailView.tsx`
- `client/src/views/TeamView.tsx`
- `client/src/views/AgentProfileView.tsx`
- `client/src/components/FilterBar.tsx`
- `client/src/components/CreateModal.tsx`
- `client/src/components/Sidebar.tsx`
- `client/src/components/AcceptanceCriteria.tsx`
