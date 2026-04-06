# UI Improvements Design — 2026-04-06

## Scope

Three UI improvements plus one MCP backend fix:

1. Backlog unified list with filtering and clickable badges
2. Agent skills: source field, read-only superpowers skills, editable manual skills
3. AI reformat button in creation forms
4. MCP `start_story` skill injection (included with #2)

---

## 1. Backlog: unified list with filtering + clickable badges

### FilterBar changes

- Add `featureId: string` to the `Filters` type (alongside existing `epicId`)
- Add item-type toggle chips: `All | Stories | Features` (stored as `itemType: 'all' | 'stories' | 'features'`, default `'all'`)
- Add a feature dropdown filter (filters stories by feature; shown when type is All or Stories)
- Existing epic, assignee, priority, and search filters remain

### Backlog list rendering

- Fetch stories + features for the project (features already fetched via `api.features.listAll()`)
- Apply type filter: Stories → hide features; Features → show only features; All → show both
- Layout: feature rows and story rows interleaved, grouped by feature (feature row followed by its stories)
- Apply remaining filters (epic, assignee, priority, search, featureId) to their respective item types

**Story rows (existing):**
- Feature badge becomes a `<button>` that navigates to the feature detail page on click
- Clicking the row itself still opens the StoryPanel (stop propagation on badge click)

**Feature rows (new):**
- Same card style as story rows, with a left border colored by `featureColor(feature.id)`
- Show: `feature.short_id`, feature title, and an epic badge colored by `featureColor(feature.epic_id)` — clickable, navigates to the epic detail page
- No StoryPanel on click — navigate directly to the feature detail page

### Feature detail page badge (harmony)

- Add a colored epic badge in `FeatureDetailView.tsx` header using `featureColor(feature.epic_id)`, linking to the epic detail page
- Mirrors the badge pattern used in the backlog

---

## 2. Agent skills: source field + read-only superpowers + editable manual

### Data model

`AgentSkill` interface gains an optional field:

```typescript
interface AgentSkill {
  name: string
  content: string
  source?: 'superpowers' | 'manual'  // undefined treated as 'manual' for backwards compat
}
```

No DB schema change required — `skills` is already JSONB; the new field is just an additional key in each object.

### Seed migration

In `server/src/db/seed.ts`, add a migration that runs on startup:
- For each agent, iterate skills
- Set `source: 'superpowers'` where `name.startsWith('superpowers:')` and `source` is not already set
- Set `source: 'manual'` on all others where `source` is not already set
- Only write back if changes were made

### UI — AgentProfileView rendering

**Superpowers skills** (`source === 'superpowers'`):
- Accordion header: show skill name (not clickable to rename), no delete button, chevron to expand
- Expanded content: `<MarkdownContent>` render of `skill.content` (read-only, same styling as DocsView)
- No edit controls, no "Changes save on blur" hint

**Manual skills** (`source === 'manual'` or `source` undefined):
- Existing behavior: editable name (click to rename), textarea for content, delete button, save on blur

### UI — Add skill form

- When adding a new skill via "Add skill", set `source: 'manual'` in the created object
- No other changes to the add form

---

## 3. AI reformat button in CreateModal

### Backend endpoint

```
POST /api/ai/reformat
Body: { type: 'epic' | 'feature' | 'story', title: string, description: string }
Response: { title: string, description: string }
```

- Protected by `requireAuth` (already applied globally to `/api`)
- Uses `ANTHROPIC_API_KEY` env var; returns `501 Not Implemented` if not set
- Calls `claude-haiku-4-5-20251001` (fast, low cost) via the Anthropic SDK
- Prompt includes: item type, the canonical template for that type, and the user's raw title + description
- Returns cleaned title and description formatted to the template

Templates are inlined server-side (mirroring the existing ones in CreateModal).

### Frontend — CreateModal changes

- Remove pre-filled template content from the description textarea (starts empty)
- Remove placeholder text from title and description inputs
- Add a `✦ Format` button (small, slate-colored, next to the description label or in the action bar)
- On click: button shows spinner, calls `POST /api/ai/reformat`, populates title and description fields with the response
- If the backend returns 501 (no API key), hide the button entirely
- On error: show a brief inline error message, leave fields unchanged

### Environment

Add `ANTHROPIC_API_KEY` to the documented env vars in CLAUDE.md.

---

## 4. MCP — start_story skill injection

### Change

In `mcp/src/index.ts`, after `start_story` moves the story to `in_progress`:

1. Fetch the assigned agent by slug from `GET /api/agents/:slug`
2. Append to the response text block:

```
---
## Your Skills

{skill.name}
{skill.content}

{skill.name}
{skill.content}
...
```

- Only include skills with non-empty content
- If agent fetch fails, return the story-only response (graceful degradation)

This ensures agents see their full skill set the moment they claim a story, regardless of how the dispatcher prompt was written.

---

## Files to change

### Server
- `server/src/db/seed.ts` — source field migration
- `server/src/routes/ai.ts` — new reformat endpoint (new file)
- `server/src/index.ts` — mount `/api/ai` router

### MCP
- `mcp/src/index.ts` — enrich `start_story` response with agent skills

### Client
- `client/src/lib/api.ts` — add `source` to `AgentSkill`, add `ai.reformat()` call
- `client/src/components/FilterBar.tsx` — add `itemType` + `featureId` filter fields
- `client/src/views/BacklogView.tsx` — unified list with features, clickable badges
- `client/src/views/AgentProfileView.tsx` — split superpowers vs manual skill rendering
- `client/src/views/FeatureDetailView.tsx` — add epic badge in header
- `client/src/components/CreateModal.tsx` — remove templates/placeholders, add Format button
