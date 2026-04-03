# Devlog — Design Document

**Date:** 2026-04-01  
**Status:** Approved  
**Board project:** DEVLOG (id: b7b4a157-201b-4fee-b0f2-117abc6757c6)

## Overview

Devlog is a micro-journaling CLI + web UI for developers. During a session you append timestamped notes from the terminal; at end of day a single command calls Claude and returns a standup-ready narrative. A local web UI shows the full session timeline.

---

## Architecture

```
devlog/
├── cli/          Node.js CLI — commander + better-sqlite3 + @anthropic-ai/sdk
├── server/       Express REST API — reads same SQLite file, serves client build
└── client/       React + Vite + TypeScript + Tailwind CSS
```

Data lives at `~/.devlog/devlog.db` (SQLite, user-global).

---

## Data Model

| Table | Columns |
|---|---|
| `sessions` | id, date (YYYY-MM-DD), created_at |
| `entries` | id, session_id, text, created_at |
| `summaries` | id, session_id, text, created_at |

---

## CLI Commands

| Command | Description |
|---|---|
| `devlog note <text>` | Append entry to today's session (creates session if none) |
| `devlog list [--date YYYY-MM-DD]` | Print today's entries with timestamps |
| `devlog summary [--date YYYY-MM-DD]` | Call Claude, print narrative, store in summaries table |
| `devlog open` | Open browser to `http://localhost:4242` |

---

## REST API

| Endpoint | Description |
|---|---|
| `GET /api/sessions` | List all sessions (id, date, entry count) |
| `GET /api/sessions/:id/entries` | All entries for a session |
| `GET /api/sessions/:id/summary` | Stored summary for a session (null if not yet generated) |

Server runs on port 4242. In production build, Express serves the React SPA from `client/dist/`.

---

## Web UI

- **Session sidebar** — list of past sessions, click to select
- **Entry timeline** — timestamped entries for selected session
- **Summary panel** — rendered summary text with copy-to-clipboard button
- Light mode, clean documentation aesthetic (Tailwind + shadcn/ui)
- No real-time needed — simple polling or manual refresh is sufficient

---

## Claude Integration

- Model: `claude-haiku-4-5-20251001` (fast, low cost)
- Config: `ANTHROPIC_API_KEY` env var
- Prompt: converts raw timestamped entries into a polished standup paragraph
- Result printed to terminal and stored in `summaries` table

---

## Agent Assignment

| Feature | Agent |
|---|---|
| Data layer & CLI core | Dev In (⚙️) |
| Claude summary integration | Dev In (⚙️) |
| Express REST API | Dev In (⚙️) |
| Web UI timeline | Fron Tina (🎨) |
| Tests | Tess Ter (🧪) |
| Documentation | Doc Tor (📝) |

---

## Board Stories Created

**Feature: Data layer & CLI core**
- Initialize SQLite schema (sessions, entries, summaries) — 8 min
- `devlog note` command — 10 min
- `devlog list` command — 5 min
- `devlog open` command — 3 min

**Feature: Claude summary integration**
- Claude API client setup — 5 min
- Build summary prompt from entries — 5 min
- `devlog summary` command — 10 min

**Feature: Express REST API**
- Express server scaffold with static serving — 8 min
- GET /api/sessions — 5 min
- GET /api/sessions/:id/entries — 5 min
- GET /api/sessions/:id/summary — 5 min

**Feature: Web UI timeline**
- App shell + session sidebar — 10 min
- Entry timeline component — 8 min
- Summary panel with copy button — 8 min

**Feature: Tests**
- CLI unit tests — 10 min
- API integration tests — 10 min
- Summary prompt unit test — 5 min

**Feature: Documentation**
- README with install guide — 8 min
- CLI help text and error messages — 5 min
