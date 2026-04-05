---
type: design
---

# Claude-Driven Board Creation from Plans

## Problem

The doc-watcher/doc-parser approach (server-side markdown parsing via chokidar) is the wrong architecture:
- It runs on Railway and cannot see locally-written plan files
- It auto-creates shallow board items with no template content
- It adds complex server infrastructure for something Claude can do better

## Decision

Claude creates board items directly after writing a plan, using the templates in `docs/templates/`. The server handles storage and display. Claude handles intelligence.

## What Gets Removed

- `server/src/lib/doc-watcher.ts` — entire file (chokidar watcher)
- `server/src/lib/doc-parser.ts` — `syncDocToBoard`, `parseDocStructure`, `archiveEpicFromDoc`, `ParsedDoc` interface (keep `parseFrontmatter` if still used, otherwise remove entire file)
- `server/tests/doc-sync.test.ts` — entire file (archiving tests)
- `POST /api/docs/sync` route — server-side parsing endpoint
- `startDocWatcher` call in `server/src/index.ts`
- `source_doc` backfill logic (was in syncDocToBoard)

Schema columns added during archiving work that are **kept**:
- `epics.source_doc TEXT` — still used, now set explicitly by Claude via `create_epic`

## What Gets Added

### Backend

**`POST /api/docs/upload`** — writes a doc permanently to `DOCS_PATH` on the server so the UI can display it.

```
Body: { path: "plans/2026-04-05-story-time-tracking.md", content: "# ..." }
```

- Validates path (no traversal, must end in `.md`, must be under DOCS_PATH)
- Creates parent directories if needed
- Writes file to `DOCS_PATH/plans/...`
- Returns `{ ok: true, path: "plans/2026-04-05-story-time-tracking.md" }`

**`create_epic` route** — add optional `source_doc` parameter:
```
POST /api/epics
Body: { project_id, title, description, version?, source_doc? }
```

### MCP Tools

**`upload_doc(file_path)`** — reads a local file and uploads to server:
- Reads local file at `file_path`
- Derives relative path (everything from `/docs/` onward, or just `plans/<filename>`)
- POSTs `{ path, content }` to `POST /api/docs/upload`
- Returns the relative path for use as `source_doc`

**`create_epic` tool** — add optional `source_doc` parameter so Claude can set the plan reference.

### Frontend

On the epic detail view, if `source_doc` is set:
- Display a clickable link: **"Plan: Story Time Tracking →"**
- Display name derived from filename: strip date prefix (`2026-04-05-`), strip `.md`, replace `-` with spaces, title-case
- Link navigates to `/docs/plans/2026-04-05-story-time-tracking.md` (existing doc viewer route)

### Writing-Plans Skill Patch

After saving the plan file, add a mandatory board setup step:

```
### Board Setup

After saving the plan to docs/plans/, immediately:

1. Upload the plan to the server:
   upload_doc("absolute/local/path/to/plan.md")
   → returns relative_path (e.g. "plans/2026-04-05-story-time-tracking.md")

2. Create the epic (read epic-template.md, fill from plan's Goal + Architecture):
   create_epic(project_id, title, description, source_doc=relative_path)

3. Create feature(s) (read feature-template.md, fill from plan context):
   create_feature(epic_id, title, description)
   — One per H2 heading; if no H2, one feature titled after the plan's domain

4. Create stories (read story-template.md, fill from each ### Task):
   create_story(feature_id, title, description, estimated_minutes)
   — Title = H3 heading text
   — Acceptance criteria from the task's - [ ] lines
   — Estimated minutes from step count × 5

This runs for EVERY plan saved. No exceptions.
```

## Claude Flow (End-to-End)

```
Claude writes docs/plans/2026-04-05-story-time-tracking.md
  → upload_doc() → server stores file → visible in UI at /docs/plans/...
  → create_epic("Story Time Tracking", <template-filled description>, source_doc="plans/...")
  → create_feature("Tasks", <template-filled description>)
  → create_story("Add started_at column", <template>, estimated_minutes=10)
  → create_story("Set timestamps on transitions", <template>, estimated_minutes=10)
  → ... (one per ### Task)
  → Offer execution choice (subagent-driven vs parallel session)
```

## Frontend: source_doc Display

```ts
// Utility: "plans/2026-04-05-story-time-tracking.md" → "Story Time Tracking"
function planDisplayName(source_doc: string): string {
  const filename = source_doc.split('/').pop() ?? source_doc
  return filename
    .replace(/\.md$/, '')
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Link URL: "/docs/" + source_doc
const docUrl = `/docs/${epic.source_doc}`
```

## Tests

1. `POST /api/docs/upload` writes file to DOCS_PATH and returns ok
2. `POST /api/docs/upload` rejects path traversal attempts
3. `create_epic` accepts and stores `source_doc`
4. Frontend utility: `planDisplayName` converts paths to readable names correctly
