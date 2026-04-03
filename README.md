# Agent Board

A Jira-like project management system for Claude Code agents. Agents have named identities on the board, their work is tracked in real time via MCP, and plan documents auto-sync to create epics, features, and stories automatically.

## Architecture

- **Web app** (Express + React + SQLite) — deployed to Railway
- **MCP server** (Node.js stdio) — runs locally in Claude Code
- **board-workflow skill** — maps superpowers skills to agent identities
- **doc-watcher** — watches `docs/plans/` and auto-creates board items from markdown

## Quick Start

### 1. Deploy the web app

Push to GitHub — Railway auto-deploys on push to `master`.

Add a volume mounted at `/app/data` for SQLite persistence.

### 2. Configure the MCP server

```bash
npm run build --workspace=mcp
```

Add to Claude Code settings (`~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "agent-board": {
      "command": "node",
      "args": ["/absolute/path/to/agent-board/mcp/dist/index.js"],
      "env": { "BOARD_URL": "https://your-app.railway.app" }
    }
  }
}
```

### 3. Load the board-workflow skill

Add `skills/board-workflow.md` as a user skill in Claude Code settings. It maps superpowers skills to agent identities and enforces board discipline (start_story before coding, complete_story after).

## Development

```bash
# Start backend (hot reload)
npm run dev:server --workspace=server

# Start frontend (in another terminal)
npm run dev:client --workspace=client
```

Board UI: http://localhost:5173

## Plan → Board Auto-Sync

When a superpowers agent (Arch Lee, writing-plans) saves a plan to `docs/plans/`, the doc-watcher automatically creates board items:

```
docs/plans/2026-04-03-my-feature.md
  → Epic (from # heading)
    → Feature "Tasks" (auto-created)
      → Story per ### Task N: heading
```

**Required frontmatter:**
```markdown
---
project: BOARD   ← must match a project key
type: implementation-plan
---

# Feature Name

### Task 1: Do something
### Task 2: Do something else
```

Items are created idempotently — re-saving a plan adds new tasks without duplicating existing ones.

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `BOARD_URL` | `http://localhost:3000` | MCP → board URL |
| `DATA_DIR` | cwd | Directory for `data.db` SQLite file |
| `DOCS_PATH` | `../docs` | Root directory watched for markdown sync |

## Agent Roster

| Agent | Slug | Scope | Superpowers Skills |
|---|---|---|---|
| 📋 Pro Ject | pro-ject | Project management | brainstorming, writing-plans |
| 🏛️ Arch Lee | arch-lee | Architecture & planning | brainstorming, writing-plans |
| 🧪 Tess Ter | tess-ter | Testing & QA | test-driven-development |
| 🐛 Deb Ugg | deb-ugg | Debugging | systematic-debugging |
| 🔍 Rev Yu | rev-yu | Code review | requesting-code-review |
| 🚀 Dee Ploy | dee-ploy | Deployment & merge | finishing-a-development-branch |
| ⚙️ Dev In | dev-in | Backend implementation | executing-plans |
| 🎨 Fron Tina | fron-tina | Frontend implementation | frontend-design, executing-plans |
| 📝 Doc Tor | doc-tor | Documentation | doc-coauthoring |
| 🛠️ Pip Lynn | pip-lynn | DevOps, CI/CD & infrastructure | — |

Agent skill loadouts are configurable from the UI (Team → agent profile → Skills).

## Agent Workflow

```
start_story(story_id, agent_id)   ← before writing any code
  ... implement ...
complete_story(story_id, agent_id, checklist_confirmed: true)
```

See `skills/board-workflow.md` for the full dispatch protocol.

## CI

GitHub Actions runs on every push to `master` and pull request:
- Build: server, mcp, client
- Test: server (vitest)
- Lint: client (ESLint)
