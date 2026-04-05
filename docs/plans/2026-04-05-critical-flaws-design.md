---
project: BOARD
type: design
---

# Fix Critical Flaws: Dockerfile, story_id Handoff, Iron Law Enforcement

## Problem Summary

Three critical flaws were identified in the system diagram review:

1. **`client/dist` committed to git** — Railway's Nixpacks build uses Node 18, incompatible with Vite 8 (needs Node 20.19+). Workaround is committing compiled frontend to git before every push. Brittle, pollutes history, easy to forget.

2. **Fragile story_id handoff** — Dispatching agents write subagent prompts manually and can forget `story_id`. The implementing agent stalls. No story_id lookup is mandated anywhere in the dispatch flow.

3. **Iron Law not technically enforced** — `start_story` before code and `complete_story` after build passes are discipline-only. Nothing in the skill flow requires it. `checklist_confirmed: true` is self-reported.

## Design Constraint

Superpowers skills (`dispatching-parallel-agents`, `executing-plans`, `subagent-driven-development`) are community-maintained open source. They must not be permanently forked. Instead:

- Patches are **surgical and minimal** — 3–5 lines per skill
- All patches are **conditionally guarded** — skills behave identically when agent-board MCP is not configured
- Patches live in `agent-board/patches/superpowers/` and are re-applied via script after any `/update`
- A new user adds agent-board on top of superpowers by: (1) configuring the MCP, (2) running `apply-superpowers-patches.sh` once

---

## Flaw 1 — `client/dist` in git → Dockerfile

### What changes

| File | Action |
|---|---|
| `agent-board/Dockerfile` | New file — builds client + server on Node 22 |
| `agent-board/.gitignore` | Add `client/dist/` |
| `client/dist/` | Remove from git tracking (`git rm -r --cached`) |
| `agent-board/CLAUDE.md` | Remove the "Pre-built client" section and `build:local` before push instruction |
| `agent-board/README.md` | Remove manual rebuild step, add Docker note |

### Dockerfile design

```dockerfile
FROM node:22-alpine
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
COPY mcp/package.json ./mcp/
RUN npm ci

# Build everything (client + server + mcp)
COPY . .
RUN npm run build:local

# Runtime
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=server"]
```

Railway detects the Dockerfile automatically and uses it over Nixpacks. `client/dist/` is built inside the image at deploy time — never needs to be in git.

### Acceptance criteria

- `client/dist/` is in `.gitignore` and removed from git tracking
- `docker build .` succeeds locally from `agent-board/`
- Railway deploy succeeds and serves the React UI correctly
- No manual rebuild step required before `git push`

---

## Flaw 2 — Fragile story_id handoff → patch `dispatching-parallel-agents`

### What changes in the skill

File: `~/.claude/plugins/cache/claude-plugins-official/superpowers/<version>/skills/dispatching-parallel-agents/SKILL.md`

Insert after "## The Pattern" header, before "### 1. Identify Independent Domains":

```markdown
### 0. Resolve Story IDs (if agent-board is available)

Before writing any subagent prompts, check if the `get_board` MCP tool is available.

**If available:**
1. Call `list_stories` filtered to the relevant project/feature to find stories matching your tasks
2. Note each story's `short_id` (e.g. `BOARD-42`)
3. Every subagent prompt must include:
   - `Story ID: <short_id>`
   - `Your agent slug: <slug>` (see agent roster in board-workflow skill)
   - `REQUIRED: Use the board-workflow skill. Call start_story before writing any code.`

**If not available:** Skip this step entirely. Continue as normal.
```

Update the "Each agent gets" list (in "### 2. Create Focused Agent Tasks") to add:
- `Story ID: <short_id from board>` ← mandatory when board is available
- `REQUIRED: Use the board-workflow skill`

Update the example prompt template to show these fields.

### Acceptance criteria

- Dispatching agents look up story IDs from the board before writing prompts
- Subagent prompts always contain `story_id` when the board is configured
- When board MCP is absent, skill output is identical to unpatched version

---

## Flaw 3 — Iron Law not enforced → patches to `executing-plans` + `implementer-prompt.md`

### What changes in `executing-plans`

File: `~/.claude/plugins/cache/.../skills/executing-plans/SKILL.md`

In "### Step 2: Execute Tasks", prepend to the "For each task:" steps:

```markdown
**Board tracking (if story_id provided in your task):**
- Call `start_story(story_id, agent_id)` before any file edits — this is not optional
- Call `complete_story(story_id, agent_id, checklist_confirmed: true)` only after the build passes and all acceptance criteria are confirmed
- If no `story_id` was provided, skip this entirely
```

### What changes in `implementer-prompt.md`

File: `~/.claude/plugins/cache/.../skills/subagent-driven-development/implementer-prompt.md`

Add a `## Board Tracking` section to the template body, after `## Your Job`:

```markdown
## Board Tracking

If a `Story ID` was included in your task prompt:
1. Call `start_story(story_id, agent_slug)` **before writing any code** — mandatory
2. Add a comment via `add_comment` at each significant milestone or non-obvious decision
3. Call `complete_story(story_id, agent_slug, checklist_confirmed: true)` only after:
   - Tests pass
   - Every acceptance criterion in the story is confirmed met
   - No regressions introduced
If no Story ID was provided, skip this section entirely.
```

### Acceptance criteria

- Implementing agents call `start_story` before the first file edit
- `complete_story` is only called after build verification
- Board shows accurate In Progress / Done status reflecting actual work state
- When no story_id is present, skill behavior is identical to unpatched version

---

## Patch Infrastructure

### Directory layout

```
agent-board/
  patches/
    superpowers/
      dispatching-parallel-agents.patch
      executing-plans.patch
      subagent-driven-development-implementer-prompt.patch
  scripts/
    apply-superpowers-patches.sh
```

### `apply-superpowers-patches.sh` design

```bash
#!/bin/bash
# Finds the latest installed superpowers version and applies all agent-board patches

SUPERPOWERS_BASE="$HOME/.claude/plugins/cache/claude-plugins-official/superpowers"
LATEST=$(ls -v "$SUPERPOWERS_BASE" | tail -1)
SKILLS="$SUPERPOWERS_BASE/$LATEST/skills"
PATCHES="$(dirname "$0")/../patches/superpowers"

echo "Applying agent-board patches to superpowers $LATEST..."

patch --forward "$SKILLS/dispatching-parallel-agents/SKILL.md" < "$PATCHES/dispatching-parallel-agents.patch"
patch --forward "$SKILLS/executing-plans/SKILL.md" < "$PATCHES/executing-plans.patch"
patch --forward "$SKILLS/subagent-driven-development/implementer-prompt.md" < "$PATCHES/subagent-driven-development-implementer-prompt.patch"

echo "Done. Run this script again after any superpowers /update."
```

`--forward` flag: silently skips patches that are already applied (idempotent).

### `board-workflow.md` updates

The existing "For Dispatching Agents" section is strengthened:
- Adds a mandatory pre-dispatch step: if `get_board` is available, run `list_stories` and collect short_ids before writing any prompt
- Documents what to do if story_id is missing from an incoming task: stop, call `list_stories`, find it — do not start without it
- References the patched dispatching skills as the mechanism that enforces this upstream

---

## README Prerequisites Section

```markdown
## Prerequisites

This project requires [Superpowers](https://github.com/...) to be installed in Claude Code.

After installing superpowers and configuring the MCP server, run:

\`\`\`bash
./scripts/apply-superpowers-patches.sh
\`\`\`

This applies small, conditional patches to three superpowers skills that wire them to the agent board. The patches are no-ops when the agent-board MCP is not configured — superpowers continues to work normally for all other projects.

After any superpowers update (`/update` in Claude Code), re-run the script.
```

---

## What is explicitly not changing

- No superpowers skills are permanently forked or replaced
- `board-workflow.md` remains the sole owned adapter skill
- The MCP server API is unchanged — no new tools, no breaking changes
- Agent slugs, workflows, and data model are unchanged
