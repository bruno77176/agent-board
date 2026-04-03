# Recap — Design Document

**Date:** 2026-04-02  
**Status:** Approved

## Overview

Recap is an AI-powered meeting notes processor for business teams. A user pastes raw, informal meeting notes; Claude extracts structured action items with owner, description, and optional due date. A minimal web UI surfaces all meetings and open items, filterable by owner and status.

**Board project key:** RECAP

---

## Data Model

### meetings
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (UUID) | Primary key |
| `title` | TEXT | User-provided or auto-generated |
| `raw_notes` | TEXT | Original unstructured input |
| `status` | TEXT | `processing` / `done` / `failed` |
| `error` | TEXT | Null unless status = `failed` |
| `created_at` | TEXT | ISO timestamp |

### action_items
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (UUID) | Primary key |
| `meeting_id` | TEXT | Foreign key → meetings |
| `description` | TEXT | What needs to be done |
| `owner` | TEXT | Person responsible |
| `due_date` | TEXT | ISO date, nullable |
| `status` | TEXT | `open` / `in_progress` / `done` |

No user authentication in v1 — single-tenant, single team.

---

## Architecture

```
┌──────────────────────────────────────┐
│  Business user (browser)             │
│  React + Vite + Tailwind             │
└──────────────┬───────────────────────┘
               │ HTTP
┌──────────────▼───────────────────────┐
│  Express.js REST API                 │
│  better-sqlite3 (persistent volume)  │
│  @anthropic-ai/sdk                   │
└──────────────┬───────────────────────┘
               │ HTTPS
┌──────────────▼───────────────────────┐
│  Anthropic Claude API                │
└──────────────────────────────────────┘
```

**Deployment:** Single Railway/Render service. Env vars: `PORT`, `ANTHROPIC_API_KEY`.

---

## REST API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/meetings` | Submit raw notes → triggers AI extraction |
| `GET` | `/api/meetings` | List all meetings (title, created_at, item count) |
| `GET` | `/api/meetings/:id` | Meeting detail + all action items |
| `PATCH` | `/api/action-items/:id` | Update item status |
| `GET` | `/api/owners` | List distinct owners |
| `GET` | `/api/owners/:name` | All action items for one owner |

---

## AI Extraction Flow

1. `POST /api/meetings` receives `{ title?, raw_notes }`
2. Meeting saved with `status: "processing"`
3. Claude called with a structured prompt requesting JSON output:
   ```json
   [{ "description": "...", "owner": "...", "due_date": "YYYY-MM-DD or null" }]
   ```
4. Response parsed; action items inserted into DB
5. Meeting status updated to `"done"`
6. On any failure: status → `"failed"`, error message stored

**Model:** `claude-haiku-4-5-20251001` (fast, cost-efficient for extraction)

---

## Frontend Views

| View | Description |
|---|---|
| **Dashboard** | List of meetings with title, date, open item count |
| **Meeting detail** | Raw notes + extracted action items with status controls |
| **Owner view** | Filter all action items by owner name |

---

## Epics

| # | Epic | Description |
|---|---|---|
| 1 | Core API & persistence | Express setup, SQLite schema, CRUD endpoints |
| 2 | AI extraction pipeline | Claude integration, prompt design, JSON parsing |
| 3 | Web frontend | Submission form, dashboard, meeting detail, owner view |
| 4 | Action item tracking | Status update flow, owner filter, open item counts |

---

## Testing Strategy

- **Unit tests:** Action item extraction parser, status transition validation
- **Integration tests:** API endpoints with a test SQLite DB
- **TDD cycles:** Extraction pipeline and status machine are prime candidates for RED/GREEN/REFACTOR
