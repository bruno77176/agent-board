---
type: design
---

# Doc-Watcher Archiving Design

## Problem

`syncDocToBoard` is create-only. When a `### Task N:` heading is removed from a plan file and the file is re-saved, the corresponding story stays on the board indefinitely as an orphan. When a plan file is deleted entirely, all its stories remain. The board drifts from the plan.

## Decisions

- **Orphaned stories are archived** (status → `archived`), not deleted. Reversible.
- **File deletion triggers archiving** of all non-done stories from that plan's epic.
- **In-progress stories get archived too**, but with a warning comment so the agent knows.
- **Manually-created stories in a plan-sourced epic are subject to archiving** if their title doesn't match any task in the plan. Documented behavior — plan-sourced epics are owned by the plan file.

## Schema

```sql
ALTER TABLE epics ADD COLUMN IF NOT EXISTS source_doc TEXT;
```

Nullable. Stores the absolute file path that created the epic. Existing manually-created epics stay null and are never touched by archiving logic.

No new column on stories. `archived` is already a valid status value.

## Logic Changes

### `syncDocToBoard` (doc-parser.ts)

1. On epic **create**: set `source_doc = filePath`
2. On epic **found** (existing, source_doc is null): update `source_doc = filePath` — backfills on next re-save
3. After all features/stories are processed:
   - Collect all story titles present in the new plan
   - Query all stories in this epic where `status NOT IN ('done', 'archived')`
   - For each story whose title is NOT in the new plan:
     - Set `status = 'archived'`
     - If story was `in_progress`, `review`, or `qa`: insert an event/comment: `"⚠️ Archived by doc-sync — task removed from plan while in progress"`
     - Broadcast `story.archived`

### New `archiveEpicFromDoc(filePath, sql, broadcast)` (doc-parser.ts)

- Find all epics where `source_doc = filePath`
- For each epic: archive all stories where `status NOT IN ('done', 'archived')`
  - Comment: `"⚠️ Archived by doc-sync — plan file deleted"`
  - Broadcast `story.archived` per story
- Log total archived count

### `startDocWatcher` (doc-watcher.ts)

Add `unlink` handler:
```ts
watcher.on('unlink', async (filePath: string) => {
  try {
    await archiveEpicFromDoc(filePath, sql, broadcast)
  } catch (err) {
    console.error('[doc-watcher] Error archiving on delete', filePath, err)
  }
})
```

Renames are handled automatically: chokidar fires `unlink` (old path archived) then `add` (new path syncs, epic found by title, `source_doc` updated).

## Tests

1. **Re-sync removes a story** — 3 tasks → sync → remove 1 → re-sync → that story is `archived`, other 2 unchanged
2. **Done stories survive re-sync** — story at `done` is not archived even if removed from plan
3. **In-progress story archived with comment** — story at `in_progress` gets archived + warning comment when removed from plan
4. **File delete archives all** — `unlink` event → all non-done stories in that epic become `archived`
5. **Rename round-trip** — unlink old + add new → stories archived from old path, epic `source_doc` updated to new path, no duplication

## Documentation update

Add to `README.md` under doc-watcher section:

> **Note:** Epics created from plan files are owned by that file. Stories in a plan-sourced epic whose title no longer appears in the plan will be automatically archived on re-sync. Manually-created stories added to a plan-sourced epic are subject to the same rule.
