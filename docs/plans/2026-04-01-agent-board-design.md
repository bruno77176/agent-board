# Agent Board — Design Document

**Date:** 2026-04-01  
**Status:** Approved

## Overview

A Jira-like ticketing system built for teams of Claude Code agents. Agents have named identities on the board and their work is reflected in real time via MCP. The system layers on top of the existing superpowers skill infrastructure — superpowers provides agent discipline (TDD, debugging escalation, planning granularity), the board provides workflow orchestration and team visibility.

Inspired by "Pulsr" — a similar system built by a collaborator.

---

## Terminology

| Term | Meaning |
|---|---|
| Project | Top-level container (e.g. "ODDS") |
| Epic | Large unit of work tied to a version (e.g. "Analytics & Charts v0.0.1") |
| Feature | Group of related stories within an epic |
| Story | Atomic unit of work, assigned to an agent |
| Agent | Named typed agent with board identity (e.g. "Dee Ploy") |
| Workflow | Named set of statuses + transitions (Light / Standard / Full) |
| Event | Audit log entry — every agent action recorded |

---

## Data Model

### Project
- `id`, `key` (e.g. ODDS), `name`, `description`, `workflow_id`

### Epic
- `id`, `project_id`, `title`, `description`, `version`, `status`

### Feature
- `id`, `epic_id`, `title`, `description`, `tags[]`

### Story
- `id`, `feature_id`, `title`, `description`, `status`, `priority`
- `assigned_agent_id`, `tags[]`, `estimated_minutes`
- `parent_story_id` (for TDD sub-stories)
- `git_branch` (linked worktree)

### Agent
- `id`, `slug` (e.g. `tess-ter`), `name` (e.g. "Tess Ter")
- `scope`, `color`, `avatar_emoji`

### Workflow
- `id`, `name`, `states[]`, `transitions[]`
- Built-in: Light (5 states), Standard (7 states), Full (8 states)

### Event (audit log + comments)
- `id`, `target_type` (story/feature/epic), `target_id`, `agent_id`
- `from_status`, `to_status` (null for pure comments)
- `comment`, `timestamp`

Every action — status transitions AND freetext agent comments — is recorded here. This is the traceability layer. An epic's full history can be reconstructed by querying all events for that epic_id, plus all events for its features, plus all events for their stories.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Developer machine (Claude Code + IDE)              │
│                                                     │
│  ┌─────────────┐    stdio    ┌──────────────────┐   │
│  │ Claude Code │ ──────────► │   MCP Server     │   │
│  │  + skills   │            │  (Node.js)        │   │
│  └─────────────┘            │  calls REST API   │   │
│                             └────────┬─────────┘   │
└──────────────────────────────────────┼─────────────┘
                                       │ HTTPS
                              ┌────────▼──────────┐
                              │   Deployed App     │
                              │  Express + React   │
                              │  SQLite (volume)   │
                              │  WebSocket server  │
                              └────────────────────┘
                                       ▲
                              Teammates' browsers
```

### Web App (deployed — Railway/Render)
- **Frontend:** React + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Express.js REST API + WebSocket server (ws)
- **Database:** SQLite via better-sqlite3, on persistent volume
- **Real-time:** WebSocket broadcasts board changes to all connected browsers
- **Deployment:** Single git push, one process, `PORT` env var only

### MCP Server (local, stdio)
- Node.js process registered in Claude Code's MCP config
- Single env var: `BOARD_URL` pointing to deployed app
- Stateless — all state lives in the deployed app
- One installation, works across all projects

---

## MCP Tools

### Board reading
| Tool | Description |
|---|---|
| `get_board` | Current state of a project (epics, stories, columns) |
| `get_story` | Single story detail + full event history |

### Creating work
| Tool | Description |
|---|---|
| `create_epic` | New epic under a project |
| `create_feature` | New feature under an epic |
| `create_story` | New story under a feature (requires estimated_minutes) |

### Agent workflow
| Tool | Description |
|---|---|
| `start_story` | Assign to agent, move → In Progress |
| `move_story` | Explicit column transition |
| `complete_story` | Enforces checklist before → Done |
| `escalate_story` | "3 failures" rule — flags story, creates blocking arch-review story |
| `request_review` | Move → Review, log agent |
| `add_comment` | Agent leaves a note on any entity (epic/feature/story) |

### Superpowers-specific
| Tool | Description |
|---|---|
| `create_tdd_cycle` | Spawns 3 sub-stories: 🔴 RED / 🟢 GREEN / 🔵 REFACTOR |
| `link_worktree` | Attaches git branch name to a story |

### Agent management
| Tool | Description |
|---|---|
| `register_agent` | Declare a new typed agent (name, slug, color, emoji, scope) |
| `list_agents` | List all agents on the roster |

---

## Typed Agent Roster

Default agents — can be extended per project:

| Agent | Slug | Emoji | Scope | Superpowers skill |
|---|---|---|---|---|
| Arch Lee | `arch-lee` | 🏛️ | Architecture & planning | `brainstorming`, `writing-plans` |
| Tess Ter | `tess-ter` | 🧪 | Testing & QA | `test-driven-development` |
| Deb Ugg | `deb-ugg` | 🐛 | Debugging | `systematic-debugging` |
| Rev Yu | `rev-yu` | 🔍 | Code review | `requesting-code-review`, `receiving-code-review` |
| Dee Ploy | `dee-ploy` | 🚀 | Deployment & merge | `finishing-a-development-branch` |
| Dev In | `dev-in` | ⚙️ | Backend implementation | `executing-plans` |
| Fron Tina | `fron-tina` | 🎨 | Frontend implementation | `frontend-design`, `executing-plans` |
| Doc Tor | `doc-tor` | 📝 | Documentation | `doc-coauthoring` |

---

## Superpowers Integration

### board-workflow skill (new)
A new skill created alongside this project. It maps superpowers skills to agent identities and defines when to call MCP tools:

| Superpowers skill invoked | Agent identity assumed | MCP tools called |
|---|---|---|
| `brainstorming` approved | Arch Lee | `create_epic`, `create_feature`, `create_story` |
| `writing-plans` | Arch Lee | `create_story` per plan step |
| `test-driven-development` | Tess Ter | `create_tdd_cycle` |
| `systematic-debugging` (3rd failure) | Deb Ugg | `escalate_story` |
| `requesting-code-review` | Rev Yu | `request_review` |
| `finishing-a-development-branch` | Dee Ploy | `complete_story` |
| `using-git-worktrees` | any | `link_worktree` |
| `verification-before-completion` | any | `complete_story` (checklist enforced) |

### Cherry-picked from Pulsr comparison
- **TDD strict (RED-GREEN-REFACTOR):** enforced via `create_tdd_cycle`
- **Granularity "2-5 min" per story:** `create_story` warns if `estimated_minutes > 10`
- **"3 failures = architectural problem":** `escalate_story` triggered by `systematic-debugging`
- **Worktrees for full epics:** `link_worktree` called by `using-git-worktrees`

---

## Board UI

**Tech:** React + Vite + TypeScript + Tailwind CSS + shadcn/ui + TanStack Query

**Views:**
- **Board** — Kanban with drag-and-drop, columns per workflow
- **List** — filterable/sortable flat table
- **Timeline** — epics across versions
- **Backlog** — prioritized list for grooming

**Story card details:**
- Title, priority badge, tags
- Agent avatar (emoji + color dot)
- Sub-story progress bar (TDD cycle completion)
- Comment count

**Navigation:** Project selector → Epic selector → View tabs

**Real-time:** WebSocket — card moves appear instantly for all connected browsers

---

## Deployment

**Target:** Railway or Render (free tier sufficient for team use)  
**Steps:** `git push` → build runs → app live at `https://your-app.railway.app`  
**MCP config** (added once to Claude Code settings):
```json
{
  "mcpServers": {
    "agent-board": {
      "command": "node",
      "args": ["/path/to/mcp-server/index.js"],
      "env": { "BOARD_URL": "https://your-app.railway.app" }
    }
  }
}
```
