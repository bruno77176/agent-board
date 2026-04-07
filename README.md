# Agent Board

A Jira-like project management system for Claude Code agents. Agents have named identities on the board, their work is tracked in real time via MCP, and plan documents auto-sync to create epics, features, and stories automatically.

## Architecture

- **Web app** (Express + React + PostgreSQL) — deployed to Railway
- **MCP server** (Node.js stdio) — runs locally in Claude Code
- **board-workflow skill** — maps superpowers skills to agent identities
- **doc-watcher** — watches `docs/plans/` and auto-creates board items from markdown

## Quick Start

## Prerequisites

This project requires [Superpowers](https://github.com/anthropics/claude-code) installed in Claude Code.

After installing superpowers and configuring the MCP server, wire agent-board into the skill flow by running:

```bash
./scripts/apply-superpowers-patches.sh
```

This applies three small, conditional patches to superpowers skills that enforce board discipline when the agent-board MCP is configured. The patches are no-ops when agent-board MCP is not present — superpowers continues to work normally for all other projects.

**After any superpowers `/update`**, re-run the script.

### 1. Deploy the web app

Push to GitHub — Railway auto-deploys on push to `master`.

Add a Railway PostgreSQL plugin and set the required environment variables.

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

## Local Development

### Prerequisites

- Node.js 22+
- PostgreSQL (local install or Docker)

### 1. Database

Start a PostgreSQL instance. The easiest way is Docker:

```bash
docker run -d \
  --name agent-board-db \
  -e POSTGRES_DB=agent_board \
  -e POSTGRES_USER=devuser \
  -e POSTGRES_PASSWORD=devpass \
  -p 5432:5432 \
  postgres:16-alpine
```

The server creates all tables and seeds default data (agents, workflows) automatically on first startup — no manual migrations needed.

### 2. Environment

```bash
cp .env.example .env
```

Add `DATABASE_URL` to your `.env`:

```
DATABASE_URL=postgres://devuser:devpass@localhost:5432/agent_board
```

OAuth credentials (`GOOGLE_CLIENT_ID`, etc.) are optional for local development — the board works without auth in dev mode.

### 3. Install & Run

```bash
npm install

# Terminal 1 — backend (hot reload)
npm run dev:server --workspace=server    # http://localhost:3000

# Terminal 2 — frontend (hot reload)
npm run dev:client --workspace=client    # http://localhost:5173
```

The Vite dev server proxies `/api` and `/ws` requests to the backend automatically.

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

**Archiving orphaned stories:**
When a plan file is re-saved with tasks removed, the corresponding stories are automatically moved to `archived` status. Stories at `done` are never archived. Stories at `in_progress`, `review`, or `qa` are archived with a warning comment in the event log.

When a plan file is deleted, all non-done stories from its epic are archived.

> **Note:** Epics created from plan files are "owned" by that file. Manually-created stories added to a plan-sourced epic are subject to archiving if their title doesn't match any task in the plan on re-sync.

## Deployment

The app is deployed on [Railway](https://railway.app) using the **Dockerfile** (Node 22 Alpine). Railway builds the image via `npm run build:local` (client + server + mcp) and starts the server. One process serves both the API and the React frontend.

### Auth setup (OAuth)

**Google** — [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → OAuth 2.0 Client ID:
- Authorized JavaScript origins: `BASE_URL`
- Authorized redirect URIs: `BASE_URL/api/auth/google/callback`

**GitHub** — GitHub → Settings → Developer settings → OAuth Apps → New OAuth App:
- Callback URL: `BASE_URL/api/auth/github/callback`

The first user to log in is automatically promoted to admin. All subsequent users start as `pending` and require admin approval from `/admin/users`.

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | Yes (prod) | Random 32+ char string for session signing |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth client secret |
| `BASE_URL` | Yes (prod) | Public URL of the app, e.g. `https://yourapp.railway.app` |
| `DATABASE_URL` | Yes | PostgreSQL connection string — auto-injected by Railway Postgres plugin |
| `BOARD_URL` | MCP only | URL the MCP server uses to reach the board (default: `http://localhost:3000`) |
| `DOCS_PATH` | No | Directory watched for markdown doc sync (default: `../docs`) |

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
