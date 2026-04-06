# UI Fluidity & Homogeneity Design

**Date:** 2026-04-05  
**Epic theme:** Navigation should be fluid and consistent — every entity (story, feature, epic, doc, agent) is reachable by clicking its ID or avatar from any context where it appears.

---

## Problem

Four related issues break the homogeneous navigation experience:

1. **Epics list** shows long description previews — visually inconsistent with the clean single-line backlog rows
2. **Epic URLs** use UUIDs (`/epics/70f93814-...`) instead of human-readable short IDs (`/epics/BOARD-E1`)
3. **Docs URLs** are stateless — all docs open at `/BOARD/docs` with no per-doc URL, so you can't link to or bookmark a specific doc
4. **Clickable IDs and agent avatars** are inconsistently wired — some navigate, some don't; agent avatars in display contexts are not clickable

---

## Design

### Section 1: Epics List

Replace the card-with-description layout with clean single-line rows matching the backlog style:

- Left: `BOARD-E1` short_id badge (monospace, muted)
- Center: epic title
- Right: status badge (`Active`, `Completed`, etc.)
- No description shown in the list — description lives only on the detail page

### Section 2: Epic URL (short_id routing)

Change epic detail URL from UUID to short_id:

- **Before:** `/:projectKey/epics/70f93814-ff08-4cf0-8ac6-2f889256f825`
- **After:** `/:projectKey/epics/BOARD-E1`

No backend change needed — the server already supports `WHERE id = X OR short_id = X`. Update all `navigate()` calls that reference an epic to use `epic.short_id ?? epic.id`.

### Section 3: Docs URL Routing

Add per-doc URL routing:

- **New route:** `/:projectKey/docs/:docSlug` (alongside existing `/:projectKey/docs`)
- `docSlug` = filename without `.md` extension (e.g. `2026-04-01-agent-board-design`)
- Clicking a doc in the sidebar navigates to `/:projectKey/docs/:docSlug`
- `DocsView` reads `docSlug` from URL params on load and auto-selects the matching file
- Sidebar highlights the active doc based on URL param, not component state
- Existing `/docs` (global) route gets the same treatment with a global doc path

### Section 4: Clickable IDs and Agent Avatars

**Rule:** every entity badge or avatar is clickable in display contexts; filter-toggle avatars keep their existing behavior.

**Agent avatars:**
- **Filter context** (backlog toolbar, board header — avatars are filter toggles): click = filter, no change
- **Display context** (story detail sidebar assignee, feature detail story rows, board cards showing assigned agent): click = navigate to `/team/:agentSlug`

**ID badges:**
- `BOARD-EX` badges: navigate to `/:projectKey/epics/:epicShortId`
- `BOARD-FXX` badges: navigate to `/:projectKey/features/:featureShortId`
- `BOARD-XX` story badges: navigate to `/:projectKey/stories/:storyId` (already works in backlog — confirm and fill gaps)

**Audit locations:**
- Story detail sidebar: epic link (fix UUID → short_id), feature link (already uses short_id), agent avatar (add navigation)
- Feature detail story rows: agent emoji (add navigation)
- Board cards: agent avatar (add navigation if in display context)
- Backlog rows: agent avatar (filter context — no change), feature badge (already navigates — confirm)

---

## Out of Scope

- Redesigning the epic detail page layout
- Adding new doc viewer features (sync, search)
- Changing the board or roadmap views beyond agent avatar wiring
