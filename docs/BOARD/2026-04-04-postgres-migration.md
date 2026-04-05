---
project: BOARD
type: implementation-plan
---

# Postgres Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace SQLite (better-sqlite3, synchronous) with PostgreSQL (postgres.js, async/await) so data persists across Railway redeploys.

**Architecture:** Export a `sql` tagged-template client from `db/index.ts`; pass it as a parameter to all routers (same pattern as current `db`). All route handlers become `async`. JSONB columns replace `TEXT` JSON storage — no more `JSON.parse`/`JSON.stringify` in routes.

**Tech Stack:** `postgres` (postgres.js v3), `connect-pg-simple` (session store), Railway Postgres plugin (`DATABASE_URL`), Vitest + `pg-mem` for tests.

**Design doc:** `docs/BOARD/2026-04-04-postgres-migration-design.md`

---

## Phase 1 — Foundation

### Task 1: Swap dependencies

**Files:**
- Modify: `server/package.json`

**Step 1:** In `server/package.json`, remove `better-sqlite3` and `better-sqlite3-session-store`. Add `postgres` and `connect-pg-simple`:

```bash
cd agent-board
npm uninstall better-sqlite3 better-sqlite3-session-store --workspace=server
npm install postgres connect-pg-simple --workspace=server
npm install --save-dev @types/connect-pg-simple --workspace=server
```

**Step 2:** Verify install succeeded — no errors in output.

**Step 3:** Commit:
```bash
git add server/package.json server/package-lock.json
git commit -m "chore: swap better-sqlite3 for postgres + connect-pg-simple"
```

---

### Task 2: Rewrite db/schema.ts

**Files:**
- Modify: `server/src/db/schema.ts`

**Step 1:** Replace the entire file content with Postgres DDL. Key differences from SQLite:
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`
- `TEXT NOT NULL DEFAULT (datetime('now'))` → `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `TEXT` for JSON fields → `JSONB`
- No `PRAGMA` statements needed
- `ALTER TABLE ... ADD COLUMN` → use `DO $$ BEGIN ... EXCEPTION WHEN duplicate_column THEN NULL; END $$` for idempotent migrations
- `CHECK (from_story_id != to_story_id)` → same syntax ✓
- `ON CONFLICT` → same syntax ✓

```ts
export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    states JSONB NOT NULL DEFAULT '[]',
    transitions JSONB NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    workflow_id TEXT NOT NULL REFERENCES workflows(id),
    is_public INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    scope TEXT,
    color TEXT NOT NULL,
    avatar_emoji TEXT NOT NULL,
    skills JSONB NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS epics (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    description TEXT,
    version TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    short_id TEXT,
    start_date TEXT,
    end_date TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS features (
    id TEXT PRIMARY KEY,
    epic_id TEXT NOT NULL REFERENCES epics(id),
    title TEXT NOT NULL,
    description TEXT,
    tags JSONB NOT NULL DEFAULT '[]',
    short_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,
    feature_id TEXT NOT NULL REFERENCES features(id),
    parent_story_id TEXT REFERENCES stories(id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog',
    priority TEXT NOT NULL DEFAULT 'medium',
    assigned_agent_id TEXT REFERENCES agents(id),
    tags JSONB NOT NULL DEFAULT '[]',
    acceptance_criteria JSONB NOT NULL DEFAULT '[]',
    estimated_minutes INTEGER,
    git_branch TEXT,
    short_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL DEFAULT 'story',
    target_id TEXT NOT NULL,
    agent_id TEXT REFERENCES agents(id),
    from_status TEXT,
    to_status TEXT,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    avatar_url TEXT,
    provider TEXT NOT NULL CHECK(provider IN ('google','github')),
    provider_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_id)
  );

  CREATE TABLE IF NOT EXISTS project_members (
    id SERIAL PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS id_sequences (
    project_id TEXT NOT NULL,
    type TEXT NOT NULL,
    seq INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (project_id, type)
  );

  CREATE TABLE IF NOT EXISTS story_links (
    id TEXT PRIMARY KEY,
    from_story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    to_story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    link_type TEXT NOT NULL CHECK (link_type IN ('blocks', 'duplicates', 'relates_to')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (from_story_id != to_story_id),
    UNIQUE (from_story_id, to_story_id, link_type)
  );

  CREATE INDEX IF NOT EXISTS idx_story_links_from ON story_links(from_story_id);
  CREATE INDEX IF NOT EXISTS idx_story_links_to ON story_links(to_story_id);
`

// No separate MIGRATIONS array needed — schema is idempotent with IF NOT EXISTS.
// Future changes: add new CREATE TABLE IF NOT EXISTS or ALTER TABLE ... ADD COLUMN IF NOT EXISTS here.
export const MIGRATIONS: string[] = []
```

**Step 2:** Commit:
```bash
git add server/src/db/schema.ts
git commit -m "feat: port schema to postgres DDL"
```

---

### Task 3: Rewrite db/index.ts

**Files:**
- Modify: `server/src/db/index.ts`

**Step 1:** Replace the entire file. The `sql` export is a postgres.js tagged-template function. `nextShortId` and `backfillShortIds` become async. `getDb()` becomes `initDb()`.

```ts
import postgres from 'postgres'
import { SCHEMA } from './schema.js'

export type Sql = postgres.Sql

let _sql: postgres.Sql | null = null

export function getSql(): postgres.Sql {
  if (!_sql) throw new Error('DB not initialized — call initDb() first')
  return _sql
}

export async function initDb(): Promise<postgres.Sql> {
  if (_sql) return _sql
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL env var is required')
  _sql = postgres(connectionString, {
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
  })
  // Run schema
  await _sql.unsafe(SCHEMA)
  return _sql
}

export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end()
    _sql = null
  }
}

export async function nextShortId(
  sql: postgres.Sql,
  projectId: string,
  type: 'epic' | 'feature' | 'story'
): Promise<string> {
  const [project] = await sql`SELECT key FROM projects WHERE id = ${projectId}`
  const key = project.key
  const [row] = await sql`
    INSERT INTO id_sequences (project_id, type, seq) VALUES (${projectId}, ${type}, 1)
    ON CONFLICT (project_id, type) DO UPDATE SET seq = id_sequences.seq + 1
    RETURNING seq
  `
  const seq = row.seq
  if (type === 'epic') return `${key}-E${seq}`
  if (type === 'feature') return `${key}-F${seq}`
  return `${key}-${seq}`
}
```

**Step 2:** Commit:
```bash
git add server/src/db/index.ts
git commit -m "feat: replace better-sqlite3 with postgres.js client"
```

---

### Task 4: Rewrite db/seed.ts

**Files:**
- Modify: `server/src/db/seed.ts`

**Step 1:** Change the signature to `async function seed(sql: postgres.Sql)`. Replace all `db.prepare(...).run(...)` with `await sql\`...\``. Use `ON CONFLICT DO NOTHING` for idempotent inserts.

The key pattern: SQLite `db.prepare('INSERT OR IGNORE INTO ...').run(...)` → Postgres `await sql\`INSERT INTO ... ON CONFLICT DO NOTHING\``.

For the `readSuperpowersSkill` helper — it reads from the filesystem, stays synchronous.

For each workflow insert:
```ts
// Before
db.prepare('INSERT OR IGNORE INTO workflows (id, name, states, transitions) VALUES (?, ?, ?, ?)')
  .run(w.id, w.name, JSON.stringify(w.states), JSON.stringify(w.transitions))
// After
await sql`
  INSERT INTO workflows (id, name, states, transitions) VALUES (${w.id}, ${w.name}, ${sql.json(w.states)}, ${sql.json(w.transitions)})
  ON CONFLICT (id) DO NOTHING
`
```

For agent inserts with skills JSON:
```ts
await sql`
  INSERT INTO agents (id, slug, name, scope, color, avatar_emoji, skills)
  VALUES (${a.id}, ${a.slug}, ${a.name}, ${a.scope}, ${a.color}, ${a.avatar_emoji}, ${sql.json(a.skills)})
  ON CONFLICT (slug) DO UPDATE SET skills = EXCLUDED.skills
`
```

**Step 2:** Commit:
```bash
git add server/src/db/seed.ts
git commit -m "feat: async seed for postgres"
```

---

## Phase 2 — Server Bootstrap

### Task 5: Update server/src/index.ts

**Files:**
- Modify: `server/src/index.ts`

**Step 1:** Replace `better-sqlite3-session-store` with `connect-pg-simple`. Change startup to async — `initDb()` must complete before the server accepts traffic.

Remove:
```ts
import BetterSqliteStore from 'better-sqlite3-session-store'
import { getDb } from './db/index.js'
import { seed } from './db/seed.js'
const db = getDb()
seed(db)
const SqliteStore = BetterSqliteStore(session)
```

Add:
```ts
import connectPgSimple from 'connect-pg-simple'
import { initDb } from './db/index.js'
import { seed } from './db/seed.js'
import type { Sql } from './db/index.js'
```

Wrap startup in an async IIFE:
```ts
async function main() {
  const sql = await initDb()
  await seed(sql)

  const PgStore = connectPgSimple(session)
  app.use(session({
    store: new PgStore({ conString: process.env.DATABASE_URL }),
    secret: process.env.SESSION_SECRET ?? 'dev-secret-change-in-prod',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }))

  // ... rest of middleware setup ...

  registerStrategies(sql)
  const broadcast = createWsServer(server)
  app.use('/api/auth', authRouter())
  app.use('/api', requireAuth, createRouter(sql, broadcast))

  server.listen(PORT, () => console.log(`Agent Board running on http://localhost:${PORT}`))
}

main().catch(err => { console.error('Startup failed:', err); process.exit(1) })
```

**Step 2:** Update `passport.deserializeUser` to async:
```ts
passport.deserializeUser(async (id: unknown, done) => {
  try {
    const [user] = await sql`SELECT * FROM users WHERE id = ${id}`
    done(null, user ?? false)
  } catch (err) {
    done(err)
  }
})
```

**Step 3:** Commit:
```bash
git add server/src/index.ts
git commit -m "feat: async startup with postgres session store"
```

---

### Task 6: Update passport-strategies.ts

**Files:**
- Modify: `server/src/passport-strategies.ts`

**Step 1:** Change `upsertUser` to async, replace all `db.prepare` calls:

```ts
import postgres from 'postgres'

async function upsertUser(
  sql: postgres.Sql,
  provider: 'google' | 'github',
  provider_id: string,
  email: string,
  name: string,
  avatar_url: string | null,
): Promise<any> {
  const [existing] = await sql`
    SELECT * FROM users WHERE provider = ${provider} AND provider_id = ${provider_id}
  `
  if (existing) {
    await sql`UPDATE users SET name = ${name}, avatar_url = ${avatar_url} WHERE id = ${existing.id}`
    const [updated] = await sql`SELECT * FROM users WHERE id = ${existing.id}`
    return updated
  }
  const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM users`
  const role = count === 0 ? 'admin' : 'member'
  const status = count === 0 ? 'active' : 'pending'
  const [user] = await sql`
    INSERT INTO users (email, name, avatar_url, provider, provider_id, role, status)
    VALUES (${email}, ${name}, ${avatar_url}, ${provider}, ${provider_id}, ${role}, ${status})
    RETURNING *
  `
  return user
}

export function registerStrategies(sql: postgres.Sql): void {
  // Change all callback functions to async, await upsertUser(sql, ...)
}
```

**Step 2:** In each OAuth strategy's `verify` callback, add `async` and `await upsertUser(...)`.

**Step 3:** Commit:
```bash
git add server/src/passport-strategies.ts
git commit -m "feat: async passport strategies for postgres"
```

---

## Phase 3 — Routes (Mechanical Conversion)

**Pattern for every route file:**
1. Change import: `import type { Sql } from '../db/index.js'` (remove `Database` import)
2. Change function signature: `(sql: Sql, broadcast: Broadcast)` 
3. Add `async` to every route handler
4. Replace `db.prepare('...').get(id)` → `const [row] = await sql\`...\``
5. Replace `db.prepare('...').all(id)` → `const rows = await sql\`...\``
6. Replace `db.prepare('...').run(...)` → `await sql\`...\``
7. Remove `JSON.parse(row.tags)`, `JSON.stringify(tags)` — JSONB handles it
8. For short_id resolution: `const [row] = await sql\`SELECT ... WHERE id = ${id} OR short_id = ${id}\``

**SQL parameter syntax:** `postgres.js` uses `${variable}` in tagged templates — NOT `?` or `$1`.

---

### Task 7: Convert routes/agents.ts + routes/workflows.ts

**Files:**
- Modify: `server/src/routes/agents.ts`
- Modify: `server/src/routes/workflows.ts`

These are simple read-only routes. Convert each `db.prepare(...).all()` → `await sql\`...\``. Add `async` to handlers. Remove `JSON.parse` for JSONB fields (skills, states, transitions).

**Step 1:** Convert agents.ts — one `GET /` and one `GET /:id`. Make async.

**Step 2:** Convert workflows.ts — one `GET /` handler. Make async.

**Step 3:** Commit:
```bash
git add server/src/routes/agents.ts server/src/routes/workflows.ts
git commit -m "feat: async agents and workflows routes for postgres"
```

---

### Task 8: Convert routes/epics.ts

**Files:**
- Modify: `server/src/routes/epics.ts`

**Step 1:** Convert all handlers to async. For the `GET /:id` handler that builds nested features with story counts — the current approach uses `placeholders` for IN clauses. With postgres.js, arrays work directly:

```ts
// Before (SQLite)
const placeholders = featureIds.map(() => '?').join(',')
db.prepare(`SELECT ... WHERE feature_id IN (${placeholders})`).all(...featureIds)

// After (postgres.js)
const storyCounts = await sql`
  SELECT feature_id, status, COUNT(*)::int as count
  FROM stories WHERE feature_id = ANY(${featureIds})
  GROUP BY feature_id, status
`
```

**Step 2:** Remove `JSON.parse(f.tags)` — already an array from JSONB.

**Step 3:** Commit:
```bash
git add server/src/routes/epics.ts
git commit -m "feat: async epics route for postgres"
```

---

### Task 9: Convert routes/features.ts

**Files:**
- Modify: `server/src/routes/features.ts`

**Step 1:** Convert all handlers to async. `nextShortId` is now async — `await nextShortId(sql, ...)`.

**Step 2:** `tags` field in POST body: pass directly (postgres.js will serialize JSONB). Remove `JSON.stringify(tags ?? [])`.

**Step 3:** For `PATCH /:id` — build dynamic UPDATE. In postgres.js you can use `sql(obj, ...keys)` for partial updates, or build it manually. Simplest approach: use explicit COALESCE:
```ts
await sql`
  UPDATE features SET
    title = COALESCE(${title ?? null}, title),
    description = COALESCE(${description ?? null}, description),
    tags = COALESCE(${tags ? sql.json(tags) : null}, tags)
  WHERE id = ${feature.id}
`
```

**Step 4:** Commit:
```bash
git add server/src/routes/features.ts
git commit -m "feat: async features route for postgres"
```

---

### Task 10: Convert routes/stories.ts

**Files:**
- Modify: `server/src/routes/stories.ts`

**Step 1:** Convert all handlers to async. This is the most complex route file.

For `GET /` with dynamic filters — build query string manually since postgres.js doesn't support dynamic WHERE clauses natively. Use `sql.unsafe()` only if needed, or use conditional fragments:
```ts
const rows = await sql`
  SELECT s.* FROM stories s
  JOIN features f ON s.feature_id = f.id
  JOIN epics e ON f.epic_id = e.id
  WHERE e.project_id = ${project_id}
  ${status ? sql`AND s.status = ${status}` : sql``}
  ${resolvedAgentId ? sql`AND s.assigned_agent_id = ${resolvedAgentId}` : sql``}
  ORDER BY s.created_at DESC
`
```

**Step 2:** `tags`, `acceptance_criteria` — JSONB, remove all `JSON.parse`/`JSON.stringify`.

**Step 3:** `nextShortId` is async — `await nextShortId(sql, featureRow.project_id, 'story')`.

**Step 4:** Commit:
```bash
git add server/src/routes/stories.ts
git commit -m "feat: async stories route for postgres"
```

---

### Task 11: Convert routes/story-links.ts

**Files:**
- Modify: `server/src/routes/story-links.ts`

Straightforward. Short_id resolution: `WHERE id = ${id} OR short_id = ${id}`. DELETE returns 204 (already correct). Convert all handlers to async.

**Step 1:** Convert. Keep the `UNIQUE` constraint conflict handling:
```ts
try {
  await sql`INSERT INTO story_links ...`
} catch (e: any) {
  if (e.code === '23505') return res.status(409).json({ error: 'Link already exists' })
  throw e
}
```
(Postgres unique violation error code is `23505`, not a message containing `UNIQUE`)

**Step 2:** Commit:
```bash
git add server/src/routes/story-links.ts
git commit -m "feat: async story-links route for postgres"
```

---

### Task 12: Convert routes/events.ts + routes/admin.ts

**Files:**
- Modify: `server/src/routes/events.ts`
- Modify: `server/src/routes/admin.ts`

Simple conversions. Make handlers async, replace `db.prepare`.

For admin.ts — `pending-count` endpoint and user approval. Straightforward.

**Step 1:** Convert events.ts.

**Step 2:** Convert admin.ts — note `COUNT(*)` returns a string in some drivers; add `::int` cast:
```ts
const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM users WHERE status = 'pending'`
```

**Step 3:** Commit:
```bash
git add server/src/routes/events.ts server/src/routes/admin.ts
git commit -m "feat: async events and admin routes for postgres"
```

---

### Task 13: Convert routes/members.ts

**Files:**
- Modify: `server/src/routes/members.ts`

**Step 1:** Convert handlers to async. Unique conflict for duplicate member:
```ts
try {
  await sql`INSERT INTO project_members (project_id, user_id) VALUES (${project.id}, ${member.id})`
} catch (e: any) {
  if (e.code === '23505') return res.status(409).json({ error: 'Already a member' })
  throw e
}
```

**Step 2:** Commit:
```bash
git add server/src/routes/members.ts
git commit -m "feat: async members route for postgres"
```

---

### Task 14: Convert routes/projects.ts

**Files:**
- Modify: `server/src/routes/projects.ts`

**Step 1:** The `GET /` handler has membership filtering with a LEFT JOIN. Port directly — SQL is the same.

**Step 2:** `GET /:id/overview` has nested IN clauses — use `= ANY(${ids})` like in epics.

**Step 3:** Unique key conflict: `e.code === '23505'` instead of `e.message?.includes('UNIQUE')`.

**Step 4:** Commit:
```bash
git add server/src/routes/projects.ts
git commit -m "feat: async projects route for postgres"
```

---

### Task 15: Convert routes/auth.ts + routes/docs.ts

**Files:**
- Modify: `server/src/routes/auth.ts`
- Modify: `server/src/routes/docs.ts`

**auth.ts:** The `/me` endpoint uses `req.user` (set by passport) — no direct DB calls. `/pending-count` calls admin route. No changes needed beyond signature.

**docs.ts:** The `POST /sync` handler calls `syncDocToBoard` (already async). The `GET /` and `GET /*` handlers read the filesystem — no DB calls. No changes needed to these handlers. Only signature update.

**Step 1:** Update both files — change `db: Database.Database` parameter to `sql: Sql`. Update any internal DB calls.

**Step 2:** Commit:
```bash
git add server/src/routes/auth.ts server/src/routes/docs.ts
git commit -m "feat: update auth and docs routes for postgres"
```

---

### Task 16: Convert routes/index.ts

**Files:**
- Modify: `server/src/routes/index.ts`

**Step 1:** Update all router function signatures — change `db: Database.Database` parameter type to `Sql`:
```ts
import type { Sql } from '../db/index.js'
export function createRouter(sql: Sql, broadcast: Broadcast): Router {
  router.use('/projects', projectsRouter(sql, broadcast))
  // ... etc
}
```

**Step 2:** Commit:
```bash
git add server/src/routes/index.ts
git commit -m "feat: update router index for postgres"
```

---

## Phase 4 — Utilities

### Task 17: Convert lib/doc-parser.ts

**Files:**
- Modify: `server/src/lib/doc-parser.ts`

**Step 1:** Change `syncDocToBoard` signature to accept `sql: Sql` instead of `db: Database.Database`. Convert all `db.prepare` calls to `await sql\`...\``.

JSONB: `tags` stored as `'[]'` TEXT in SQLite, now as JSONB. Insert as:
```ts
await sql`INSERT INTO features (id, epic_id, title, description, short_id, tags) 
  VALUES (${featId}, ${epicId}, ${feat.title}, ${feat.description || null}, ${featShortId}, ${sql.json([])})`
```

For `acceptance_criteria` on story insert — pass as `sql.json(story.acceptance_criteria)`.

**Step 2:** Update all callers of `syncDocToBoard` (in `doc-watcher.ts` and `routes/docs.ts`) to pass `sql` instead of `db`.

**Step 3:** Update `lib/doc-watcher.ts` to accept and pass `sql: Sql`.

**Step 4:** Update `server/src/index.ts` to pass `sql` to `startDocWatcher`.

**Step 5:** Commit:
```bash
git add server/src/lib/doc-parser.ts server/src/lib/doc-watcher.ts
git commit -m "feat: async doc-parser and doc-watcher for postgres"
```

---

## Phase 5 — Build, Test & Deploy

### Task 18: Build and fix TypeScript errors

**Step 1:** Run TypeScript compiler:
```bash
cd agent-board && npm run build --workspace=server 2>&1
```

**Step 2:** Fix any type errors. Common issues:
- `postgres.Sql` type import
- `sql\`...\`` returns `postgres.RowList<Row[]>` — destructure with `const [row] = await sql\`...\``
- `COUNT(*)` returns string without `::int` cast

**Step 3:** Repeat until clean build.

**Step 4:** Commit any fixes:
```bash
git add -A
git commit -m "fix: typescript errors after postgres migration"
```

---

### Task 19: Update tests

**Files:**
- Modify: `server/tests/routes.test.ts`
- Modify: `server/tests/db.test.ts`
- Modify: `server/tests/seed.test.ts`

**Step 1:** Install `pg-mem` for in-memory Postgres testing:
```bash
npm install --save-dev pg-mem --workspace=server
```

**Step 2:** Create a test helper `server/tests/helpers/test-db.ts`:
```ts
import { newDb } from 'pg-mem'

export async function createTestDb() {
  const mem = newDb()
  // pg-mem provides a pg-compatible interface
  const { Pool } = mem.adapters.createPg()
  const pool = new Pool()
  // Use DATABASE_URL pointing to pg-mem
  process.env.DATABASE_URL = 'postgresql://localhost/test'
  // ... setup
}
```

Note: if `pg-mem` compatibility is insufficient, use `TEST_DATABASE_URL` pointing to a real Postgres DB and skip in CI without it.

**Step 3:** Update `buildApp()` in routes.test.ts to use async setup with the test DB.

**Step 4:** Run tests:
```bash
npm run test --workspace=server
```

**Step 5:** Fix any test failures. Commit:
```bash
git add server/tests/
git commit -m "test: update tests for postgres"
```

---

### Task 20: Railway Postgres setup + deploy

**Step 1:** In Railway dashboard:
1. Go to your project → **+ New** → **Database** → **Add PostgreSQL**
2. Railway auto-injects `DATABASE_URL` into your service — verify it appears in **Variables** tab

**Step 2:** Remove `DATA_DIR` env var from Railway Variables if set.

**Step 3:** Push to deploy:
```bash
git push
```

**Step 4:** Watch Railway build logs — look for `Agent Board running on http://localhost:3000` without errors.

**Step 5:** Verify:
- Open the board UI — log in via OAuth
- Create a project, epic, story
- Trigger a redeploy (push an empty commit): `git commit --allow-empty -m "chore: test persistence" && git push`
- Verify data survived the redeploy ✅

**Step 6:** Final commit (update CLAUDE.md if needed):
```bash
git commit -m "feat: migrate to postgres — data now persists across deploys"
```

---

## Quick Reference: SQLite → postgres.js Cheat Sheet

| SQLite | postgres.js |
|--------|-------------|
| `db.prepare('SELECT * FROM t WHERE id = ?').get(id)` | `const [row] = await sql\`SELECT * FROM t WHERE id = ${id}\`` |
| `db.prepare('SELECT * FROM t').all()` | `const rows = await sql\`SELECT * FROM t\`` |
| `db.prepare('INSERT INTO t VALUES (?)').run(v)` | `await sql\`INSERT INTO t VALUES (${v})\`` |
| `db.prepare('INSERT ... RETURNING *').get(v)` | `const [row] = await sql\`INSERT ... RETURNING *\`` |
| `JSON.stringify(arr)` (for tags field) | Just `arr` or `sql.json(arr)` |
| `JSON.parse(row.tags)` | Just `row.tags` (already an object) |
| `e.message?.includes('UNIQUE')` | `e.code === '23505'` |
| `WHERE id IN (${placeholders})` | `WHERE id = ANY(${ids})` |
| `COUNT(*) as count` | `COUNT(*)::int as count` |
| `datetime('now')` | `NOW()` |
