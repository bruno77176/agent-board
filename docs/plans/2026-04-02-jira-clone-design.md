# Jira Clone — Design Doc

**Epic:** BOARD-E2  
**Date:** 2026-04-02  
**Status:** Approved

## Overview

Close the gap between agent-board and Jira by adding four high-value features: issue links, drag-and-drop, swimlanes, and a roadmap. Sprints are intentionally excluded — the continuous-flow agent workflow makes sprint ceremonies unnecessary overhead.

## What We're NOT Building

- Sprints / sprint planning / velocity tracking
- Time tracking / work logs
- Attachments
- Watchers / notifications
- Bulk operations
- JQL / advanced search

## Approach

Two phases:

1. **Phase 1 (backend)** — DB migrations + API endpoints + MCP tools. Must land before Phase 2.
2. **Phase 2 (frontend)** — Four UI features built in parallel by separate agents after Phase 1 is merged.

---

## Phase 1: Backend Changes

### Data Model

**New table: `story_links`**

```sql
CREATE TABLE story_links (
  id TEXT PRIMARY KEY,
  from_story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  to_story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN ('blocks', 'duplicates', 'relates_to')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

The inverse relationship ("is blocked by") is derived at read time — if A blocks B, then B is blocked by A. No duplicate rows.

**Epic date columns (migration):**

```sql
ALTER TABLE epics ADD COLUMN start_date TEXT;
ALTER TABLE epics ADD COLUMN end_date TEXT;
```

Both nullable ISO date strings (e.g. `"2026-04-01"`).

### REST API

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `GET` | `/api/stories/:id/links` | — | All links for a story (both directions) |
| `POST` | `/api/stories/:id/links` | `{ to_story_id, link_type }` | Create a link |
| `DELETE` | `/api/stories/:id/links/:linkId` | — | Remove a link |
| `PATCH` | `/api/epics/:id` | `{ start_date?, end_date?, ...existing }` | Update epic (extend existing endpoint) |

`GET /api/stories/:id` should also include links in its response payload.

### MCP Tools

- **`link_stories`** — `{ from_story_id, to_story_id, link_type }` — agents declare blockers between stories
- **`get_story_links`** — `{ story_id }` — agents check what's blocking a story before picking it up

### WebSocket Events

Broadcast on link mutations so the UI stays in sync:
- `story_link_created` — `{ link }`
- `story_link_deleted` — `{ linkId, from_story_id, to_story_id }`

---

## Phase 2: Frontend Features

All four can be built in parallel after Phase 1 lands.

### 1. Drag-and-Drop (Kanban Board)

- Library: `@dnd-kit/core` (lightweight, React 19 compatible)
- Dragging a card between columns calls `PATCH /api/stories/:id` with the new status
- Optimistic update on drop; revert on API error
- No schema changes

### 2. Swimlanes

- Toggle in the board toolbar (alongside Board / List view toggle)
- Group options: **Epic**, **Assignee**, **Priority**
- Each swimlane = a horizontal band with its own full set of Kanban columns
- Pure UI grouping — no schema changes
- Default: no swimlane (current behavior)

### 3. Issue Links (Story Detail)

- New "Linked issues" section on the story detail page
- Links grouped by type: Blocks / Blocked by / Duplicates / Relates to
- "Add link" button → search-and-select dialog (search stories by short_id or title)
- Board cards: small badge indicator (e.g. 🚫) when a story has unresolved blockers
- Blockers visible at a glance without opening the detail

### 4. Roadmap

- New "Roadmap" nav item in the sidebar under each project
- Horizontal Gantt-style timeline; epics as rows
- Each epic bar spans `start_date` → `end_date`
- Epics without dates render as a dot at the left edge
- Clicking an epic navigates to its detail view
- Date range picker in toolbar (default: current quarter)
- Inline date editing: drag epic bar edges to set start/end dates (calls `PATCH /api/epics/:id`)

---

## Success Criteria

- Agents can call `link_stories` to declare blockers and `get_story_links` to check blockers before starting work
- Humans can drag cards between Kanban columns
- Board can be grouped into swimlanes by epic, assignee, or priority
- Epics appear on a timeline in the Roadmap view with editable date ranges
