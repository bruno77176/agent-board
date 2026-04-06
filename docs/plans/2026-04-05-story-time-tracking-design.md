---
type: design
---

# Story Time Tracking Design

## Problem

Stories have `estimated_minutes` but no way to track how long they actually took. There is no visibility into time spent per story, feature, or epic. Estimates cannot be compared to actuals.

## Decision

Add `started_at` and `completed_at` timestamp columns to the stories table. Derive `actual_minutes` on the fly. Surface rollups (total estimated vs actual) on features and epics.

Brainstorming time is out of scope — tracking begins when `start_story` is called.

## Schema

```sql
ALTER TABLE stories ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
```

- `started_at`: set to `NOW()` on first transition to `in_progress`. Not overwritten if story is re-opened — first start wins.
- `completed_at`: set to `NOW()` on transition to `done`.
- `actual_minutes`: derived as `EXTRACT(EPOCH FROM (completed_at - started_at)) / 60`, rounded to integer. Available on completed stories only.

## Logic Changes

### `PATCH /:id/status` (stories route)

When `status = 'in_progress'` and `started_at IS NULL`:
```sql
UPDATE stories SET status = 'in_progress', started_at = NOW(), assigned_agent_id = ... WHERE id = ?
```

When `status = 'done'`:
```sql
UPDATE stories SET status = 'done', completed_at = NOW() WHERE id = ?
```

All other transitions: no change to timestamps.

### `GET /api/stories/:id`

Response already returns the full story row — `started_at` and `completed_at` are included automatically. Add computed `actual_minutes` field:

```ts
actual_minutes: story.started_at && story.completed_at
  ? Math.round((new Date(story.completed_at).getTime() - new Date(story.started_at).getTime()) / 60000)
  : story.started_at
    ? Math.round((Date.now() - new Date(story.started_at).getTime()) / 60000) // live: time so far
    : null
```

### `GET /api/features/:id`

Add time rollup to response:

```ts
{
  ...feature,
  time_summary: {
    total_estimated_minutes: number | null,  // SUM(estimated_minutes)
    total_actual_minutes: number | null,     // SUM of actual_minutes for done stories
    completed_stories: number,
    total_stories: number
  }
}
```

### `GET /api/epics/:id`

Same rollup, aggregated across all features:

```ts
{
  ...epic,
  time_summary: {
    total_estimated_minutes: number | null,
    total_actual_minutes: number | null,
    completed_stories: number,
    total_stories: number
  }
}
```

### MCP tool changes

- `get_story`: format `started_at`, `completed_at`, `actual_minutes` in text output
- `get_feature`: include `time_summary` in output
- `get_epic`: include `time_summary` in output
- `get_board`: story rows include `started_at`, `completed_at` (already returned via query — no extra work)

## Tests

1. **started_at set on first in_progress** — transition backlog → in_progress sets started_at
2. **started_at not overwritten on re-open** — done → in_progress does not change started_at
3. **completed_at set on done** — transition in_progress → done sets completed_at
4. **actual_minutes computed correctly** — story with known started_at/completed_at returns correct value
5. **feature time_summary rollup** — 3 stories, 2 done, 1 in_progress → correct sums
6. **epic time_summary rollup** — aggregates across features correctly
