# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **agent-jira** — a Jira-like project management system built specifically for multi-agent Claude Code workflows. It consists of three packages in a monorepo under `agent-board/`:

- **server** — Express REST API + WebSocket + PostgreSQL backend
- **client** — React 19 + Vite frontend (Kanban board UI)
- **mcp** — MCP server that exposes board operations as Claude Code tools

The system is live at `http://localhost:3000` when running locally, and the MCP server connects Claude Code agents to it via stdio.

## Commands

All commands run from `agent-board/` unless noted.

```bash
# Development
npm run dev:server --workspace=server   # Start backend with hot-reload (tsx watch)
npm run dev:client --workspace=client   # Start Vite dev server (proxies /api to :3000)

# Build
npm run build:local                     # Build client + server + mcp (local dev only — Railway uses Dockerfile)
npm run build                           # Build server + mcp only (used by Railway — no Vite)
npm run build --workspace=server        # Build server only
npm run build --workspace=mcp           # Build MCP server only (required after MCP changes)

# Test
npm run test --workspace=server         # Run all server tests
npm run test --workspace=mcp            # Run all mcp tests

# Run a single test file
npx vitest run tests/routes.test.ts --workspace=server

# Lint
npm run lint --workspace=client         # ESLint on client

# Production start
npm run start --workspace=server        # Serves API + static client from dist/
```

**After any MCP changes**, always rebuild the MCP package — Claude Code loads the compiled `dist/index.js`.

## Architecture

### Data Model Hierarchy

```
Workflow → Project → Epic → Feature → Story → Events (audit log)
```

- **Workflows** define state machines (light/standard/full) with allowed transitions
- **Agents** are typed identities (pro-ject, arch-lee, tess-ter, deb-ugg, rev-yu, dee-ploy, dev-in, fron-tina, doc-tor)
- **Stories** track status, assignee, priority, acceptance criteria, and linked worktree
- **Projects** have an `is_public` flag; private projects are visible only to members
- **Users** authenticate via Google or GitHub OAuth. First user becomes admin; others start as `pending` and require admin approval

### Backend (`server/src/`)

- `index.ts` — Express app setup, session middleware, Passport init, CORS, static serving, WebSocket server. Mount order matters: `authRouter` is mounted before `requireAuth`.
- `db/schema.ts` — Postgres DDL (JSONB for arrays, TIMESTAMPTZ for timestamps, SERIAL for auto-increment IDs). Schema is idempotent — all tables use `CREATE TABLE IF NOT EXISTS`. To add a new column, add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` at the bottom of `SCHEMA`.
- `db/seed.ts` — default agents/workflows inserted on startup if absent
- `routes/` — One file per resource; all mutations broadcast WebSocket events for real-time UI updates. Pattern: mutate DB → call `broadcast({ type: 'resource.action', data })`.
- `routes/auth.ts` — OAuth entry points and `/me` endpoint. Mounted at `/api/auth` before `requireAuth`.
- `routes/admin.ts` — User management (list, approve). Protected by `requireAdmin` at the router level.
- `routes/projects.ts` — Includes membership filtering: non-admins only see public projects + projects they are a member of.
- `middleware/auth.ts` — `requireAuth` (returns 401) and `requireAdmin` (returns 403). `requireAuth` is applied globally to all `/api` routes.
- `passport-strategies.ts` — Registers Google and GitHub strategies. `upsertUser` handles first-user promotion to admin.
- `doc-watcher.ts` — Watches `DOCS_PATH` for `.md` files and syncs them to the board. Frontmatter `project_key` + H1=epic / H2=feature / H3=story heading hierarchy maps to board entities.
- Database: PostgreSQL via `DATABASE_URL` env var (Railway Postgres plugin). `db/index.ts` exports `initDb()` (async startup) and `getSql()` (access anywhere after init).
- Complex fields (`tags`, `acceptance_criteria`, `skills`, `states`, `transitions`) are stored as `JSONB` — they return as native JS objects, no `JSON.parse`/`JSON.stringify` needed.

### Short IDs vs UUIDs

Every epic, feature, and story has both a `short_id` (e.g. `BOARD-E3`, `BOARD-F17`, `BOARD-42`) for display and a UUID `id`. All read and write endpoints accept either UUID or short_id.

### Frontend (`client/src/`)

- React Router for navigation; TanStack Query for server state
- `contexts/AuthContext.tsx` — `AuthProvider` wraps the app; `useAuth()` exposes `user`, `isAdmin`, `isPending`, `isLoading`. All authenticated state lives here.
- `App.tsx` — `ProtectedRoute` redirects to `/login` if not authenticated. `AppLayout` (inside `ProtectedRoute`) calls `useBoard()` for WebSocket.
- `views/` — Page-level components (BoardView, BacklogView, EpicsView, etc.)
- `lib/api.ts` — Typed API client; all requests include `credentials: 'include'` for session cookies
- WebSocket in `useBoard.ts` hook drives live updates

### MCP Server (`mcp/src/`)

- `index.ts` — Registers all MCP tools using `@modelcontextprotocol/sdk`
- `tools/board.ts` — HTTP client wrapping the REST API
- `BOARD_URL` env var (default: `http://localhost:3000`) controls which server the MCP connects to

### Environment Variables

| Var | Default | Purpose |
|-----|---------|---------|
| `SESSION_SECRET` | dev default (warns) | Random 32+ char string for session signing — required in production |
| `GOOGLE_CLIENT_ID` | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | — | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | — | GitHub OAuth client secret |
| `BASE_URL` | `http://localhost:3000` | Public URL of the app; used for OAuth callback URLs and CORS origin |
| `BOARD_URL` | `http://localhost:3000` | MCP server → board URL |
| `DATABASE_URL` | — | PostgreSQL connection string — auto-injected by Railway Postgres plugin |
| `DOCS_PATH` | `../docs` | Root directory watched for markdown doc sync |

## MCP Tools Available

The MCP server exposes 20+ tools. Key ones:
- **Reading:** `get_board`, `get_story`, `list_agents`, `list_projects`, `list_epics`
- **Creating:** `create_project`, `create_epic`, `create_feature`, `create_story`
- **Workflow:** `start_story`, `move_story`, `request_review`, `complete_story`, `escalate_story`
- **Utilities:** `add_comment`, `create_tdd_cycle`, `link_worktree`, `update_story`

## Agent Workflow (board-workflow skill)

The `agent-board/skills/board-workflow.md` skill defines how agents interact with the board. Each superpowers skill maps to an agent identity:
- `pro-ject` — project management & requirements
- `arch-lee` — architecture/planning
- `tess-ter` — testing & QA
- `deb-ugg` — debugging
- `rev-yu` — code review
- `dee-ploy` — deployment & merge
- `dev-in` — backend implementation
- `fron-tina` — frontend implementation
- `doc-tor` — documentation

When implementing stories, agents use `start_story` before work and `complete_story` after verification.

## Deployment

Deployed on Railway via `railway.json` using Nixpacks (no Dockerfile). The server serves both API and static client files from the same process. The MCP server must be configured separately in each user's `.mcp.json` pointing to the deployed `BOARD_URL`.
