---
project: BOARD
type: design
---

# Postgres Migration Design

**Date:** 2026-04-04
**Status:** Approved
**Decision:** Migrate from SQLite (better-sqlite3, synchronous) to PostgreSQL (postgres.js, async/await)

## Problem

Railway wipes the SQLite `data.db` file on every redeploy. Sessions, users, and all board data are lost. SQLite also has a single-writer constraint that is incompatible with a multi-user system.

## Solution

Replace SQLite with Railway's managed Postgres plugin. No schema redesign — port existing tables with minimal DDL changes. All route handlers become async.

## Architecture

### Database Client
- **Library:** `postgres` (postgres.js v3) — tagged template literals, automatic connection pooling, returns JSONB as native JS objects
- **Session store:** `connect-pg-simple` — stores express sessions in a `session` table in the same Postgres DB
- **Connection:** `DATABASE_URL` env var, injected automatically by Railway Postgres plugin
- **Module:** `server/src/db/index.ts` exports a `sql` tagged template function used directly in routes

### Schema Changes (SQLite → Postgres)
| SQLite | Postgres |
|--------|----------|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` |
| `TEXT NOT NULL DEFAULT (datetime('now'))` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` |
| `TEXT` (JSON fields: tags, acceptance_criteria, states, transitions, skills) | `JSONB` |
| `PRAGMA foreign_keys = ON` | Enforced by default |
| `PRAGMA journal_mode = WAL` | N/A |
| `ON CONFLICT(col) DO UPDATE SET ...` | Same syntax ✓ |
| `CREATE TABLE IF NOT EXISTS` | Same syntax ✓ |
| `ALTER TABLE ... ADD COLUMN` (catch duplicate) | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` |

UUIDs stay as `TEXT` — no change to any ID generation logic.

### Migrations
Replace the try/catch `ALTER TABLE` array with proper `IF NOT EXISTS` / `DO $$ BEGIN ... EXCEPTION ... END $$` blocks. Run on startup, idempotent.

### Route Layer
All 12 route files convert from synchronous to async. Mechanical pattern:
```ts
// Before
const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(id)
// After  
const [story] = await sql`SELECT * FROM stories WHERE id = ${id}`
```
JSONB fields (`tags`, `acceptance_criteria`) return as native arrays/objects — remove all `JSON.parse()` and `JSON.stringify()` calls on those fields.

### Session Store
```ts
// Before
import BetterSqliteStore from 'better-sqlite3-session-store'
// After
import connectPgSimple from 'connect-pg-simple'
const PgStore = connectPgSimple(session)
app.use(session({ store: new PgStore({ conString: process.env.DATABASE_URL }) }))
```

### nextShortId
Currently uses SQLite `INSERT OR REPLACE` upsert. Port to Postgres `INSERT ... ON CONFLICT DO UPDATE` (same syntax already used). Must become async.

### doc-parser.ts
Uses synchronous `db.prepare()` calls directly. Must become async — all `syncDocToBoard` calls already use `await` at the call site, so only the internals change.

## Railway Setup
1. Add Postgres plugin to Railway service → `DATABASE_URL` auto-injected
2. Remove `DATA_DIR` env var (no longer needed)
3. No changes to `railway.json`

## Dependencies
**Add:**
- `postgres` (postgres.js)
- `connect-pg-simple`

**Remove:**
- `better-sqlite3`
- `better-sqlite3-session-store`

## Files Changed
- `server/src/db/index.ts` — new postgres client, async nextShortId, async backfill
- `server/src/db/schema.ts` — Postgres DDL
- `server/src/db/seed.ts` — async seed
- `server/src/index.ts` — async startup, connect-pg-simple session store
- `server/src/routes/*.ts` (12 files) — all handlers become async
- `server/src/lib/doc-parser.ts` — async DB calls
- `server/src/middleware/auth.ts` — deserializeUser async
- `server/src/passport-strategies.ts` — async upsertUser
- `server/package.json` — swap dependencies

## Success Criteria
- Data survives Railway redeploys
- All existing MCP tools work identically
- Sessions persist across deploys
- No data loss when adding new features (proper migrations)
