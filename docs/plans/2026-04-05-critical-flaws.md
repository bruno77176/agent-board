---
project: BOARD
type: implementation-plan
---

# Critical Flaws Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three critical flaws: remove `client/dist` from git via Dockerfile, enforce story_id handoff at the dispatch layer, and enforce the Iron Law at the implementation layer — all without breaking superpowers when agent-board is not configured.

**Architecture:** Flaw 3 (Dockerfile) is pure infra — add a Dockerfile, update .gitignore. Flaws 1 and 2 are behavioral — add minimal conditional patches to three superpowers skills, applied by a script that runs after any `/update`. All patches are no-ops when agent-board MCP is absent.

**Tech Stack:** Docker, Node 22-alpine, bash `patch` utility, unified diff format

---

### Task 1: Add Dockerfile

**Files:**
- Create: `agent-board/Dockerfile`

**Step 1: Create the Dockerfile**

```dockerfile
FROM node:22-alpine
WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
COPY mcp/package.json ./mcp/
RUN npm ci

# Copy full source and build everything
COPY . .
RUN npm run build:local

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=server"]
```

**Step 2: Verify it builds locally**

Run from `agent-board/`:
```bash
docker build -t agent-board-test .
```
Expected: Build completes with no errors. `client/dist/` is created inside the image.

**Step 3: Commit**

```bash
git add Dockerfile
git commit -m "feat: add Dockerfile for Node 22 build (fixes Vite 8 on Railway)"
```

---

### Task 2: Remove client/dist from git

**Files:**
- Modify: `agent-board/.gitignore`

**Step 1: Update .gitignore**

Open `agent-board/.gitignore`. Find the line:
```
# client/dist is committed (Railway runs Node 18, can't build Vite 8)
```

Replace that line and `*.db` onwards with:
```
client/dist/
*.db
```
(Remove the comment entirely — it's no longer true.)

**Step 2: Remove client/dist from git tracking**

Run from `agent-board/`:
```bash
git rm -r --cached client/dist/
```
Expected: Many lines like `rm 'client/dist/assets/...'`

**Step 3: Verify the files still exist on disk**

```bash
ls client/dist/
```
Expected: `assets/  favicon.svg  icons.svg  index.html` — files are still there, just untracked.

**Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: remove client/dist from git — Dockerfile builds it at deploy time"
```

---

### Task 3: Update CLAUDE.md

**Files:**
- Modify: `agent-board/CLAUDE.md`

**Step 1: Remove the pre-built client section**

Find and remove this entire block (approximately lines 55–65, the "Pre-built client" section under Deployment):

```markdown
### Pre-built client

**`client/dist/` is committed to git.** Railway's build environment is pinned to Node 18, which is incompatible with Vite 8 (requires Node 20.19+). The workaround is to build the client locally and commit the compiled output.

**Whenever you change frontend code, rebuild before pushing:**

```bash
npm run build:local    # client + server + mcp
git add client/dist/
git commit -m "chore: rebuild client dist"
git push
```

Skipping this means users will see the old UI.
```

Also find this section in the Build commands list:
```bash
npm run build:local                     # Build client + server + mcp (use before pushing)
```

Update the comment to:
```bash
npm run build:local                     # Build client + server + mcp (local dev only — Railway uses Dockerfile)
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: remove pre-built client instructions (Dockerfile handles it now)"
```

---

### Task 4: Create patch infrastructure

**Files:**
- Create: `agent-board/patches/superpowers/.gitkeep`
- Create: `agent-board/scripts/apply-superpowers-patches.sh`

**Step 1: Create directories**

```bash
mkdir -p agent-board/patches/superpowers
mkdir -p agent-board/scripts
touch agent-board/patches/superpowers/.gitkeep
```

**Step 2: Create the apply script**

Create `agent-board/scripts/apply-superpowers-patches.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SUPERPOWERS_BASE="$HOME/.claude/plugins/cache/claude-plugins-official/superpowers"
PATCHES_DIR="$(cd "$(dirname "$0")/../patches/superpowers" && pwd)"

if [ ! -d "$SUPERPOWERS_BASE" ]; then
  echo "❌ Superpowers not found at $SUPERPOWERS_BASE"
  echo "   Install superpowers in Claude Code first, then re-run this script."
  exit 1
fi

# Find the latest installed version
LATEST=$(ls -v "$SUPERPOWERS_BASE" | tail -1)
SKILLS="$SUPERPOWERS_BASE/$LATEST/skills"

echo "🔧 Applying agent-board patches to superpowers $LATEST..."
echo "   Skills dir: $SKILLS"
echo ""

apply_patch() {
  local skill_file="$1"
  local patch_file="$2"
  local label="$3"

  if patch --dry-run --silent --forward "$skill_file" < "$patch_file" 2>/dev/null; then
    patch --forward "$skill_file" < "$patch_file"
    echo "  ✅ $label"
  elif patch --dry-run --silent --reverse --forward "$skill_file" < "$patch_file" 2>/dev/null; then
    echo "  ⏭  $label (already applied)"
  else
    echo "  ⚠️  $label — patch failed (skill may have been updated upstream)"
    echo "     Check $patch_file and apply manually if needed."
  fi
}

apply_patch \
  "$SKILLS/dispatching-parallel-agents/SKILL.md" \
  "$PATCHES_DIR/dispatching-parallel-agents.patch" \
  "dispatching-parallel-agents: add story_id resolution step"

apply_patch \
  "$SKILLS/executing-plans/SKILL.md" \
  "$PATCHES_DIR/executing-plans.patch" \
  "executing-plans: add board tracking to task loop"

apply_patch \
  "$SKILLS/subagent-driven-development/implementer-prompt.md" \
  "$PATCHES_DIR/subagent-driven-development-implementer-prompt.patch" \
  "subagent-driven-development implementer-prompt: add board tracking section"

echo ""
echo "✅ Done. Re-run this script after any superpowers /update."
```

**Step 3: Make it executable**

```bash
chmod +x agent-board/scripts/apply-superpowers-patches.sh
```

**Step 4: Commit**

```bash
git add patches/ scripts/
git commit -m "feat: add patch infrastructure and apply-superpowers-patches.sh"
```

---

### Task 5: Write dispatching-parallel-agents patch

**Files:**
- Create: `agent-board/patches/superpowers/dispatching-parallel-agents.patch`

**Step 1: Verify the current file content around the insertion point**

```bash
grep -n "## The Pattern\|### 1. Identify" \
  ~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/dispatching-parallel-agents/SKILL.md
```
Expected output:
```
47:## The Pattern
49:### 1. Identify Independent Domains
```

**Step 2: Create the patch file**

Create `agent-board/patches/superpowers/dispatching-parallel-agents.patch`:

```diff
--- a/skills/dispatching-parallel-agents/SKILL.md
+++ b/skills/dispatching-parallel-agents/SKILL.md
@@ -47,6 +47,21 @@
 ## The Pattern
 
+### 0. Resolve Story IDs (if agent-board is available)
+
+**If the `list_stories` MCP tool is available** (agent-board is configured):
+1. Call `list_stories` to find stories matching your tasks (filter by project or feature)
+2. Note each story's `short_id` (e.g. `BOARD-42`)
+3. Every subagent prompt must include:
+   - `Story ID: <short_id>`
+   - `Your agent slug: <slug>` (see agent roster in the board-workflow skill)
+   - `REQUIRED: Use the board-workflow skill. Call start_story before writing any code.`
+
+**If agent-board is not configured:** Skip this step entirely. Continue as normal.
+
 ### 1. Identify Independent Domains
```

**Step 3: Dry-run the patch to verify it applies cleanly**

```bash
patch --dry-run --forward \
  ~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/dispatching-parallel-agents/SKILL.md \
  agent-board/patches/superpowers/dispatching-parallel-agents.patch
```
Expected: `checking file ... Hunk #1 succeeded`

**Step 4: Commit**

```bash
git add patches/superpowers/dispatching-parallel-agents.patch
git commit -m "feat: add dispatching-parallel-agents patch (story_id resolution)"
```

---

### Task 6: Write executing-plans patch

**Files:**
- Create: `agent-board/patches/superpowers/executing-plans.patch`

**Step 1: Verify the current file content around the insertion point**

```bash
sed -n '24,32p' \
  ~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/executing-plans/SKILL.md
```
Expected output:
```
### Step 2: Execute Tasks

For each task:
1. Mark as in_progress
2. Follow each step exactly (plan has bite-sized steps)
3. Run verifications as specified
4. Mark as completed
```

**Step 2: Create the patch file**

Create `agent-board/patches/superpowers/executing-plans.patch`:

```diff
--- a/skills/executing-plans/SKILL.md
+++ b/skills/executing-plans/SKILL.md
@@ -24,6 +24,12 @@
 ### Step 2: Execute Tasks
 
+**Board tracking (if a `story_id` was provided in your task):**
+Call `start_story(story_id, agent_id)` before step 1 below.
+Call `complete_story(story_id, agent_id, checklist_confirmed: true)` after step 3, only when the build passes and every acceptance criterion is confirmed met.
+If no `story_id` was provided, skip this entirely — no change to normal behavior.
+
 For each task:
 1. Mark as in_progress
```

**Step 3: Dry-run the patch**

```bash
patch --dry-run --forward \
  ~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/executing-plans/SKILL.md \
  agent-board/patches/superpowers/executing-plans.patch
```
Expected: `Hunk #1 succeeded`

**Step 4: Commit**

```bash
git add patches/superpowers/executing-plans.patch
git commit -m "feat: add executing-plans patch (board tracking in task loop)"
```

---

### Task 7: Write subagent-driven-development implementer-prompt patch

**Files:**
- Create: `agent-board/patches/superpowers/subagent-driven-development-implementer-prompt.patch`

**Step 1: Verify the current file content around the insertion point**

```bash
sed -n '27,32p' \
  ~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/subagent-driven-development/implementer-prompt.md
```
Expected output (inside the template block, note 4-space indent):
```
    **Ask them now.** Raise any concerns before starting work.

    ## Your Job

    Once you're clear on requirements:
```

**Step 2: Create the patch file**

Create `agent-board/patches/superpowers/subagent-driven-development-implementer-prompt.patch`:

```diff
--- a/skills/subagent-driven-development/implementer-prompt.md
+++ b/skills/subagent-driven-development/implementer-prompt.md
@@ -27,6 +27,17 @@
     **Ask them now.** Raise any concerns before starting work.
 
+    ## Board Tracking
+
+    If a `Story ID` was included in your task prompt:
+    1. Call `start_story(story_id, your_agent_slug)` **before writing any code** — this is mandatory
+    2. Add a comment via `add_comment` at each major milestone or non-obvious design decision
+    3. Call `complete_story(story_id, your_agent_slug, checklist_confirmed: true)` only after:
+       - Tests pass
+       - Every acceptance criterion in the story is confirmed met
+    If no Story ID was provided, skip this section entirely.
+
     ## Your Job
```

**Step 3: Dry-run the patch**

```bash
patch --dry-run --forward \
  ~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/subagent-driven-development/implementer-prompt.md \
  agent-board/patches/superpowers/subagent-driven-development-implementer-prompt.patch
```
Expected: `Hunk #1 succeeded`

**Step 4: Commit**

```bash
git add patches/superpowers/subagent-driven-development-implementer-prompt.patch
git commit -m "feat: add implementer-prompt patch (board tracking in subagent tasks)"
```

---

### Task 8: Update board-workflow.md

**Files:**
- Modify: `agent-board/skills/board-workflow.md`
- Modify: `~/.claude/skills/board-workflow/SKILL.md` (same content — sync both)

**Step 1: Read the current file**

```bash
cat agent-board/skills/board-workflow.md
```

**Step 2: Strengthen "For Dispatching Agents" section**

Find the "For Dispatching Agents" section. Replace it with:

```markdown
## For Dispatching Agents (Pro Ject, Arch Lee, etc.)

### Step 0 — Resolve story IDs before writing any prompt

Before writing any subagent prompt, call `list_stories` filtered to the relevant project or feature.
Note each `short_id` for the tasks you're about to dispatch.

**If you cannot find a story for a task:** Create it first with `create_story`, then use its `short_id`.
**Never dispatch a subagent prompt without a `story_id`** — the implementing agent cannot update the board without it.

### Step 1 — Every subagent prompt MUST include:

```
Story ID: <story_id>
Your agent slug: <slug>

REQUIRED: Use the board-workflow skill. Call start_story before writing any code.
Call complete_story after the build passes.
```

Without the story_id in the prompt, the implementing agent cannot update the board. This is your responsibility as dispatcher.
```

**Step 3: Sync to user skills directory**

```bash
cp agent-board/skills/board-workflow.md ~/.claude/skills/board-workflow/SKILL.md
```

**Step 4: Commit**

```bash
git add skills/board-workflow.md
git commit -m "feat: strengthen board-workflow dispatch protocol (mandatory story_id lookup)"
```

---

### Task 9: Apply patches and add Prerequisites to README

**Step 1: Run the apply script**

```bash
bash agent-board/scripts/apply-superpowers-patches.sh
```
Expected output:
```
🔧 Applying agent-board patches to superpowers 5.0.7...
   Skills dir: /Users/.../superpowers/5.0.7/skills

  ✅ dispatching-parallel-agents: add story_id resolution step
  ✅ executing-plans: add board tracking to task loop
  ✅ subagent-driven-development implementer-prompt: add board tracking section

✅ Done. Re-run this script after any superpowers /update.
```

**Step 2: Verify the patches applied correctly**

```bash
grep -A 12 "### 0. Resolve Story IDs" \
  ~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/dispatching-parallel-agents/SKILL.md
```
Expected: The new step 0 block is present.

```bash
grep -A 4 "Board tracking" \
  ~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/executing-plans/SKILL.md
```
Expected: The board tracking note is present before "For each task:".

```bash
grep -A 8 "## Board Tracking" \
  ~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/subagent-driven-development/implementer-prompt.md
```
Expected: The board tracking section is present.

**Step 3: Add Prerequisites section to README**

Open `agent-board/README.md`. After the "## Quick Start" header, insert a new **"## Prerequisites"** section before "### 1. Deploy the web app":

```markdown
## Prerequisites

This project requires [Superpowers](https://github.com/claude-plugins-official/superpowers) installed in Claude Code.

After installing superpowers and configuring the MCP server, wire agent-board into the skill flow by running:

```bash
./scripts/apply-superpowers-patches.sh
```

This applies three small, conditional patches to superpowers skills. The patches are no-ops when agent-board MCP is not configured — superpowers works normally for all other projects.

**After any superpowers `/update`**, re-run the script.
```

**Step 4: Final commit**

```bash
git add README.md
git commit -m "docs: add Prerequisites section with patch setup instructions"
```

---

### Task 10: Push and verify Railway deploy

**Step 1: Push to remote**

```bash
git push
```

**Step 2: Watch the Railway deploy log**

Expected: Railway picks up the `Dockerfile`, runs `npm ci`, then `npm run build:local`, then starts the server. No "Node 18 incompatible" errors.

**Step 3: Open the deployed URL and confirm the UI loads**

Navigate to the production URL. Expected: React app loads, board is visible, no blank page.

**Step 4: Confirm client/dist is no longer in the repo**

```bash
git ls-files client/dist | wc -l
```
Expected: `0`
