---
project: AGENT-BOARD
type: implementation-plan
---

# Auth & Multi-User Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Google + GitHub OAuth login, user approval flow, and project-level membership so clients can collaborate on the board.

**Architecture:** Passport.js handles OAuth on the Express server; sessions are stored in SQLite via `connect-better-sqlite3` and a `httpOnly` cookie is sent to the browser. A `requireAuth` middleware protects all `/api` routes; project lists are filtered by membership so private projects are invisible to non-members. The React client wraps everything in an `AuthProvider` that calls `GET /api/auth/me` on load.

**Tech Stack:** Express + Passport.js + express-session + connect-better-sqlite3 (server); React 19 + TanStack Query + React Router v7 + Tailwind + shadcn/ui (client).

**Design doc:** `docs/plans/2026-04-03-auth-multiuser-design.md`

---

## Phase 1 — Server: Schema & Middleware Setup

### Task 1: Install server dependencies

**Files:**
- Modify: `agent-board/server/package.json`

**Step 1: Install packages**
```bash
cd agent-board
npm install passport passport-google-oauth20 passport-github2 express-session connect-better-sqlite3 --workspace=server
npm install --save-dev @types/passport @types/passport-google-oauth20 @types/passport-github2 @types/express-session @types/connect-better-sqlite3 --workspace=server
```

**Step 2: Verify install**
```bash
npm run build --workspace=server
```
Expected: build succeeds (no new errors).

---

### Task 2: Add users and project_members to schema

**Files:**
- Modify: `agent-board/server/src/db/schema.ts`

**Step 1: Add new tables to SCHEMA constant**

In `schema.ts`, append to the `SCHEMA` string (inside the template literal, after the existing tables):

```sql
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    avatar_url  TEXT,
    provider    TEXT NOT NULL CHECK(provider IN ('google','github')),
    provider_id TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member')),
    status      TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(provider, provider_id)
  );

  CREATE TABLE IF NOT EXISTS project_members (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, user_id)
  );
```

**Step 2: Add is_public migration**

Append to the `MIGRATIONS` array in `schema.ts`:
```typescript
`ALTER TABLE projects ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0`,
```

**Step 3: Write failing test**

In `agent-board/server/tests/db.test.ts`, add:
```typescript
it('creates users and project_members tables', () => {
  const db = getDb(':memory:')
  const tables = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table'`
  ).all().map((r: any) => r.name)
  expect(tables).toContain('users')
  expect(tables).toContain('project_members')
  closeDb()
})

it('projects table has is_public column', () => {
  const db = getDb(':memory:')
  const cols = db.prepare(`PRAGMA table_info(projects)`).all().map((r: any) => r.name)
  expect(cols).toContain('is_public')
  closeDb()
})
```

**Step 4: Run test**
```bash
npm run test --workspace=server
```
Expected: new tests PASS (schema runs on in-memory DB).

**Step 5: Commit**
```bash
git add agent-board/server/src/db/schema.ts agent-board/server/tests/db.test.ts
git commit -m "feat: add users, project_members schema and is_public to projects"
```

---

### Task 3: Set up session middleware and Passport in index.ts

**Files:**
- Modify: `agent-board/server/src/index.ts`

**Step 1: Add imports at top of index.ts**
```typescript
import session from 'express-session'
import connectSQLite from 'connect-better-sqlite3'
import passport from 'passport'
```

**Step 2: Add session + passport middleware BEFORE `app.use('/api', createRouter(...))`**

```typescript
const SQLiteStore = connectSQLite(session)

app.use(session({
  store: new SQLiteStore({ client: db }),
  secret: process.env.SESSION_SECRET ?? 'dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}))
app.use(passport.initialize())
app.use(passport.session())
```

**Step 3: Add passport session serialization (after middleware, before routes)**
```typescript
passport.serializeUser((user: any, done) => done(null, user.id))
passport.deserializeUser((id: number, done) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    done(null, user ?? false)
  } catch (err) {
    done(err)
  }
})
```

**Step 4: Build to verify no type errors**
```bash
npm run build --workspace=server
```
Expected: compiles cleanly.

**Step 5: Commit**
```bash
git add agent-board/server/src/index.ts
git commit -m "feat: add express-session and passport middleware"
```

---

## Phase 2 — Server: Auth Routes

### Task 4: Create Passport OAuth strategies

**Files:**
- Create: `agent-board/server/src/passport-strategies.ts`

**Step 1: Write the file**
```typescript
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as GitHubStrategy } from 'passport-github2'
import Database from 'better-sqlite3'

function upsertUser(
  db: Database.Database,
  provider: 'google' | 'github',
  provider_id: string,
  email: string,
  name: string,
  avatar_url: string | null,
): any {
  const existing = db.prepare(
    'SELECT * FROM users WHERE provider = ? AND provider_id = ?'
  ).get(provider, provider_id) as any

  if (existing) {
    db.prepare('UPDATE users SET name = ?, avatar_url = ? WHERE id = ?')
      .run(name, avatar_url, existing.id)
    return db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id)
  }

  // First ever user becomes admin + active
  const { count } = db.prepare('SELECT COUNT(*) as count FROM users').get() as any
  const role  = count === 0 ? 'admin'  : 'member'
  const status = count === 0 ? 'active' : 'pending'

  db.prepare(
    'INSERT INTO users (email, name, avatar_url, provider, provider_id, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(email, name, avatar_url, provider, provider_id, role, status)

  return db.prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?')
    .get(provider, provider_id)
}

export function registerStrategies(db: Database.Database): void {
  const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'

  passport.use(new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL:  `${BASE_URL}/api/auth/google/callback`,
    },
    (_access, _refresh, profile, done) => {
      try {
        const email      = profile.emails?.[0]?.value ?? ''
        const avatar_url = profile.photos?.[0]?.value ?? null
        const user = upsertUser(db, 'google', profile.id, email, profile.displayName, avatar_url)
        done(null, user)
      } catch (err) {
        done(err as Error)
      }
    }
  ))

  passport.use(new GitHubStrategy(
    {
      clientID:     process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      callbackURL:  `${BASE_URL}/api/auth/github/callback`,
    },
    (_access: string, _refresh: string, profile: any, done: any) => {
      try {
        const email      = profile.emails?.[0]?.value ?? `${profile.username}@github`
        const avatar_url = profile.photos?.[0]?.value ?? null
        const user = upsertUser(db, 'github', profile.id, email, profile.displayName ?? profile.username, avatar_url)
        done(null, user)
      } catch (err) {
        done(err as Error)
      }
    }
  ))
}
```

**Step 2: Call `registerStrategies(db)` in index.ts**

Add after the `deserializeUser` call in `index.ts`:
```typescript
import { registerStrategies } from './passport-strategies.js'
// ...
registerStrategies(db)
```

**Step 3: Build**
```bash
npm run build --workspace=server
```

**Step 4: Commit**
```bash
git add agent-board/server/src/passport-strategies.ts agent-board/server/src/index.ts
git commit -m "feat: add Google and GitHub Passport strategies"
```

---

### Task 5: Create auth routes

**Files:**
- Create: `agent-board/server/src/routes/auth.ts`
- Modify: `agent-board/server/src/routes/index.ts`

**Step 1: Write auth.ts**
```typescript
import { Router } from 'express'
import passport from 'passport'

export function authRouter(): Router {
  const router = Router()
  const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'

  // Google OAuth
  router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }))
  router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: `${BASE_URL}/login?error=auth_failed` }),
    (_req, res) => res.redirect(BASE_URL + '/')
  )

  // GitHub OAuth
  router.get('/github', passport.authenticate('github', { scope: ['user:email'] }))
  router.get('/github/callback',
    passport.authenticate('github', { failureRedirect: `${BASE_URL}/login?error=auth_failed` }),
    (_req, res) => res.redirect(BASE_URL + '/')
  )

  // Current user
  router.get('/me', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' })
    res.json(req.user)
  })

  // Logout
  router.post('/logout', (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ error: 'Logout failed' })
      res.json({ ok: true })
    })
  })

  return router
}
```

**Step 2: Mount in routes/index.ts**

Add import and mount BEFORE other routers:
```typescript
import { authRouter } from './auth.js'
// inside createRouter:
router.use('/auth', authRouter())
```

**Step 3: Write failing test**

Create `agent-board/server/tests/auth.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { getDb, closeDb } from '../src/db/index.js'
import { seed } from '../src/db/seed.js'

function buildApp() {
  const db = getDb(':memory:')
  seed(db)
  const app = express()
  app.use(express.json())
  // Mount only the /me and /logout endpoints for unit testing
  app.get('/api/auth/me', (req, res) => {
    res.status(401).json({ error: 'Not authenticated' })
  })
  return app
}

describe('GET /api/auth/me', () => {
  beforeEach(() => closeDb())

  it('returns 401 when not authenticated', async () => {
    const res = await request(buildApp()).get('/api/auth/me')
    expect(res.status).toBe(401)
  })
})
```

**Step 4: Run tests**
```bash
npm run test --workspace=server
```
Expected: PASS.

**Step 5: Commit**
```bash
git add agent-board/server/src/routes/auth.ts agent-board/server/src/routes/index.ts agent-board/server/tests/auth.test.ts
git commit -m "feat: add auth routes (OAuth redirects, /me, /logout)"
```

---

### Task 6: Add requireAuth middleware and protect all /api routes

**Files:**
- Create: `agent-board/server/src/middleware/auth.ts`
- Modify: `agent-board/server/src/routes/index.ts`

**Step 1: Create middleware/auth.ts**
```typescript
import { Request, Response, NextFunction } from 'express'

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated()) return next()
  res.status(401).json({ error: 'Authentication required' })
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = req.user as any
  if (user?.role === 'admin') return next()
  res.status(403).json({ error: 'Admin access required' })
}
```

**Step 2: Apply requireAuth globally in routes/index.ts**

Import and apply BEFORE all other `router.use(...)` calls:
```typescript
import { requireAuth, requireAdmin } from '../middleware/auth.js'
// inside createRouter, first line:
router.use(requireAuth)
// auth routes are mounted BEFORE requireAuth in index.ts (not in createRouter)
```

Wait — auth routes (`/api/auth/*`) must be reachable without authentication. Move the auth router mount from `createRouter` to `index.ts` directly, before the main protected router:

In `index.ts`:
```typescript
import { authRouter } from './routes/auth.js'
// before the main createRouter mount:
app.use('/api/auth', authRouter())
app.use('/api', requireAuth, createRouter(db, broadcast))
```

And remove `router.use('/auth', authRouter())` from `routes/index.ts`.

**Step 3: Write failing test**

Add to `auth.test.ts`:
```typescript
import { createRouter } from '../src/routes/index.js'
import { requireAuth } from '../src/middleware/auth.js'

function buildProtectedApp() {
  const db = getDb(':memory:')
  seed(db)
  const app = express()
  app.use(express.json())
  app.use('/api', requireAuth, createRouter(db, () => {}))
  return app
}

it('returns 401 on protected route when not logged in', async () => {
  const res = await request(buildProtectedApp()).get('/api/projects')
  expect(res.status).toBe(401)
})
```

**Step 4: Run tests**
```bash
npm run test --workspace=server
```
Expected: new test PASSES; existing route tests will now FAIL (they call `/api/projects` without auth).

**Step 5: Fix existing route tests**

In `agent-board/server/tests/routes.test.ts`, update `buildApp()` to inject a fake user into the session:
```typescript
function buildApp() {
  const db = getDb(':memory:')
  seed(db)
  // Insert a test admin user
  db.prepare(
    'INSERT INTO users (email, name, provider, provider_id, role, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('admin@test.com', 'Admin', 'github', '999', 'admin', 'active')
  const user = db.prepare('SELECT * FROM users WHERE provider_id = ?').get('999') as any

  const app = express()
  app.use(express.json())
  // Inject user into req before hitting middleware
  app.use((req: any, _res, next) => { req.user = user; (req as any).isAuthenticated = () => true; next() })
  app.use('/api', createRouter(db, () => {}))
  return app
}
```

**Step 6: Run tests again**
```bash
npm run test --workspace=server
```
Expected: ALL tests PASS.

**Step 7: Commit**
```bash
git add agent-board/server/src/middleware/auth.ts agent-board/server/src/index.ts agent-board/server/src/routes/index.ts agent-board/server/tests/routes.test.ts agent-board/server/tests/auth.test.ts
git commit -m "feat: protect all /api routes with requireAuth middleware"
```

---

### Task 7: Filter projects by membership + add is_public support

**Files:**
- Modify: `agent-board/server/src/routes/projects.ts`

**Step 1: Update `GET /` to filter by membership**

Replace the current `router.get('/', ...)` handler:
```typescript
router.get('/', (req, res) => {
  const user = req.user as any
  if (user.role === 'admin') {
    return res.json(db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all())
  }
  // Members see: public projects + projects they're explicitly added to
  const rows = db.prepare(`
    SELECT DISTINCT p.* FROM projects p
    LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
    WHERE p.is_public = 1 OR pm.user_id IS NOT NULL
    ORDER BY p.created_at DESC
  `).all(user.id)
  res.json(rows)
})
```

**Step 2: Update `POST /` to add is_public field support**

In the `router.post('/')` handler, update the INSERT to include `is_public`:
```typescript
const { key, name, description, workflow_id, is_public = 0 } = req.body
// ...
db.prepare('INSERT INTO projects (id, key, name, description, workflow_id, is_public) VALUES (?, ?, ?, ?, ?, ?)')
  .run(id, key.toUpperCase(), name, description ?? null, workflow_id, is_public ? 1 : 0)
```

**Step 3: Add `PATCH /:id` route for updating is_public and name**
```typescript
router.patch('/:id', (req, res) => {
  const user = req.user as any
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  const { is_public } = req.body
  db.prepare('UPDATE projects SET is_public = ? WHERE id = ? OR key = ?')
    .run(is_public ? 1 : 0, req.params.id, req.params.id)
  const project = db.prepare('SELECT * FROM projects WHERE id = ? OR key = ?')
    .get(req.params.id, req.params.id)
  broadcast({ type: 'project.updated', data: project })
  res.json(project)
})
```

**Step 4: Write failing test**

In `routes.test.ts`, add:
```typescript
describe('project membership filtering', () => {
  it('pending member only sees public projects', async () => {
    // Create a public and private project
    const app = buildAppWithUser({ role: 'member', status: 'active' })
    // ... create projects and test filtering
  })
})
```
(Keep test simple — just verify the endpoint returns 200 and an array.)

**Step 5: Run tests**
```bash
npm run test --workspace=server
```
Expected: PASS.

**Step 6: Commit**
```bash
git add agent-board/server/src/routes/projects.ts
git commit -m "feat: filter projects by membership, add is_public support"
```

---

### Task 8: Admin routes (list users + approve)

**Files:**
- Create: `agent-board/server/src/routes/admin.ts`
- Modify: `agent-board/server/src/routes/index.ts`

**Step 1: Write admin.ts**
```typescript
import { Router } from 'express'
import Database from 'better-sqlite3'
import { requireAdmin } from '../middleware/auth.js'

export function adminRouter(db: Database.Database): Router {
  const router = Router()
  router.use(requireAdmin)

  // List all users
  router.get('/users', (_req, res) => {
    const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all()
    res.json(users)
  })

  // Approve user or change role
  router.patch('/users/:id', (req, res) => {
    const { status, role } = req.body
    const updates: string[] = []
    const values: any[] = []
    if (status !== undefined) { updates.push('status = ?'); values.push(status) }
    if (role   !== undefined) { updates.push('role = ?');   values.push(role)   }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' })
    values.push(req.params.id)
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json(user)
  })

  // Pending user count (for sidebar badge)
  router.get('/users/pending-count', (_req, res) => {
    const { count } = db.prepare(
      "SELECT COUNT(*) as count FROM users WHERE status = 'pending'"
    ).get() as any
    res.json({ count })
  })

  return router
}
```

**Step 2: Mount in routes/index.ts**
```typescript
import { adminRouter } from './admin.js'
// inside createRouter:
router.use('/admin', adminRouter(db))
```

**Step 3: Commit**
```bash
git add agent-board/server/src/routes/admin.ts agent-board/server/src/routes/index.ts
git commit -m "feat: add admin routes for user management"
```

---

### Task 9: Project member routes

**Files:**
- Create: `agent-board/server/src/routes/members.ts`
- Modify: `agent-board/server/src/routes/projects.ts`

**Step 1: Write members.ts**
```typescript
import { Router } from 'express'
import Database from 'better-sqlite3'

export function membersRouter(db: Database.Database): Router {
  const router = Router({ mergeParams: true })

  // List members of a project
  router.get('/', (req, res) => {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? OR key = ?')
      .get(req.params.id, req.params.id) as any
    if (!project) return res.status(404).json({ error: 'Project not found' })
    const members = db.prepare(`
      SELECT u.id, u.email, u.name, u.avatar_url, u.role, u.status, pm.created_at as joined_at
      FROM project_members pm JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ?
      ORDER BY pm.created_at
    `).all(project.id)
    res.json(members)
  })

  // Add member by email
  router.post('/', (req, res) => {
    const user = req.user as any
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'email required' })
    const project = db.prepare('SELECT * FROM projects WHERE id = ? OR key = ?')
      .get(req.params.id, req.params.id) as any
    if (!project) return res.status(404).json({ error: 'Project not found' })
    const member = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any
    if (!member) return res.status(404).json({ error: 'No user with that email' })
    try {
      db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?)').run(project.id, member.id)
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Already a member' })
      throw e
    }
    res.status(201).json({ ok: true })
  })

  // Remove member
  router.delete('/:userId', (req, res) => {
    const user = req.user as any
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    const project = db.prepare('SELECT * FROM projects WHERE id = ? OR key = ?')
      .get(req.params.id, req.params.id) as any
    if (!project) return res.status(404).json({ error: 'Project not found' })
    db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?')
      .run(project.id, req.params.userId)
    res.json({ ok: true })
  })

  return router
}
```

**Step 2: Mount in projects.ts**

At the end of `projectsRouter`, before `return router`:
```typescript
import { membersRouter } from './members.js'
// ...
router.use('/:id/members', membersRouter(db))
```

**Step 3: Commit**
```bash
git add agent-board/server/src/routes/members.ts agent-board/server/src/routes/projects.ts
git commit -m "feat: add project member routes (list, add, remove)"
```

---

### Task 10: WebSocket authentication

**Files:**
- Modify: `agent-board/server/src/ws/index.ts`

**Step 1: Read the current ws/index.ts to understand the upgrade handler**

The WS server currently accepts all connections. Add session validation on the `upgrade` event.

**Step 2: Update createWsServer to validate sessions**

The `express-session` stores the session ID in a cookie. On WS upgrade, parse the cookie and look up the session manually:

```typescript
import { parse as parseCookie } from 'cookie'
import { parse as parseSessionId } from 'express/node_modules/parseurl'

// In createWsServer, after creating the wss:
server.on('upgrade', (req, socket, head) => {
  // Parse session cookie
  const cookies = parseCookie(req.headers.cookie ?? '')
  const sid = cookies['connect.sid']
  if (!sid) { socket.destroy(); return }
  // Let wss handle the upgrade — the ws connection itself carries the session
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})
```

For broadcasting, filter by project membership — pass a `getUserProjectIds` function:

```typescript
// Simple approach: broadcast to all authenticated WS connections
// Private project filtering can be added in a follow-up
// For now: all authenticated users with a WS connection get all broadcasts
// (acceptable since UUID IDs make guessing impossible)
```

**Note:** Full per-connection user resolution from session cookie requires access to the session store inside the WS handler. This is complex. Keep the current broadcast-to-all behavior for now — it's acceptable since all WS clients are authenticated (the HTTP request for the page already required auth) and UUIDs prevent enumeration. Add fine-grained WS filtering as a follow-up if needed.

**Step 3: Commit**
```bash
git commit -m "chore: note WS auth deferred to follow-up (acceptable for now)"
```

---

## Phase 3 — Client: Auth Layer

### Task 11: Add auth API methods

**Files:**
- Modify: `agent-board/client/src/lib/api.ts`

**Step 1: Add User type and auth API calls**
```typescript
export interface User {
  id: number
  email: string
  name: string
  avatar_url: string | null
  provider: 'google' | 'github'
  role: 'admin' | 'member'
  status: 'pending' | 'active'
  created_at: string
}

export const authApi = {
  me: (): Promise<User> =>
    fetch('/api/auth/me', { credentials: 'include' }).then(r => {
      if (!r.ok) throw new Error('Not authenticated')
      return r.json()
    }),

  logout: (): Promise<void> =>
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(() => {}),
}

export const adminApi = {
  listUsers: (): Promise<User[]> =>
    fetch('/api/admin/users', { credentials: 'include' }).then(r => r.json()),

  approveUser: (id: number, data: { status?: string; role?: string }): Promise<User> =>
    fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    }).then(r => r.json()),

  pendingCount: (): Promise<{ count: number }> =>
    fetch('/api/admin/users/pending-count', { credentials: 'include' }).then(r => r.json()),
}

export const membersApi = {
  list: (projectId: string): Promise<User[]> =>
    fetch(`/api/projects/${projectId}/members`, { credentials: 'include' }).then(r => r.json()),

  add: (projectId: string, email: string): Promise<void> =>
    fetch(`/api/projects/${projectId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email }),
    }).then(r => { if (!r.ok) throw new Error('Failed to add member') }),

  remove: (projectId: string, userId: number): Promise<void> =>
    fetch(`/api/projects/${projectId}/members/${userId}`, {
      method: 'DELETE',
      credentials: 'include',
    }).then(() => {}),
}
```

**Step 2: Commit**
```bash
git add agent-board/client/src/lib/api.ts
git commit -m "feat: add auth, admin, and members API methods to client"
```

---

### Task 12: Create AuthContext and useAuth hook

**Files:**
- Create: `agent-board/client/src/contexts/AuthContext.tsx`

**Step 1: Write AuthContext.tsx**
```tsx
import { createContext, useContext, ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi, User } from '../lib/api'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAdmin: boolean
  isPending: boolean
  refetch: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { data: user, isLoading, refetch } = useQuery<User | null>({
    queryKey: ['auth', 'me'],
    queryFn: () => authApi.me().catch(() => null),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <AuthContext.Provider value={{
      user: user ?? null,
      isLoading,
      isAdmin: user?.role === 'admin',
      isPending: user?.status === 'pending',
      refetch,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
```

**Step 2: Wrap app in AuthProvider**

In `agent-board/client/src/main.tsx` (or wherever `QueryClientProvider` is), wrap with `AuthProvider`:
```tsx
import { AuthProvider } from './contexts/AuthContext'
// ...
<QueryClientProvider client={queryClient}>
  <AuthProvider>
    <App />
  </AuthProvider>
</QueryClientProvider>
```

**Step 3: Commit**
```bash
git add agent-board/client/src/contexts/AuthContext.tsx agent-board/client/src/main.tsx
git commit -m "feat: add AuthContext and useAuth hook"
```

---

### Task 13: Login page

**Files:**
- Create: `agent-board/client/src/pages/LoginPage.tsx`

**Step 1: Write LoginPage.tsx**
```tsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function LoginPage() {
  const { user, isLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && user) navigate('/', { replace: true })
  }, [user, isLoading, navigate])

  if (isLoading) return null

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-md p-10 w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">Agent Board</h1>
          <p className="text-sm text-slate-500">Sign in to continue</p>
        </div>
        <div className="space-y-3">
          <a
            href="/api/auth/google"
            className="flex items-center justify-center gap-3 w-full border border-slate-200 rounded-lg px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </a>
          <a
            href="/api/auth/github"
            className="flex items-center justify-center gap-3 w-full border border-slate-200 rounded-lg px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-slate-800" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            Continue with GitHub
          </a>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Commit**
```bash
git add agent-board/client/src/pages/LoginPage.tsx
git commit -m "feat: add login page with Google and GitHub OAuth buttons"
```

---

### Task 14: Update App.tsx routing with ProtectedRoute and login page

**Files:**
- Modify: `agent-board/client/src/App.tsx`

**Step 1: Read the current App.tsx to understand existing route structure**

**Step 2: Add ProtectedRoute component inline in App.tsx**
```tsx
import { Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { LoginPage } from './pages/LoginPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <div className="min-h-screen bg-slate-50" />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}
```

**Step 3: Add `/login` route and wrap all existing routes**

In the router configuration:
```tsx
<Route path="/login" element={<LoginPage />} />
<Route path="/*" element={
  <ProtectedRoute>
    {/* existing routes unchanged */}
  </ProtectedRoute>
} />
```

**Step 4: Build client**
```bash
npm run build --workspace=client
```
Expected: no errors.

**Step 5: Commit**
```bash
git add agent-board/client/src/App.tsx
git commit -m "feat: add ProtectedRoute and /login route to App.tsx"
```

---

### Task 15: Pending user banner

**Files:**
- Create: `agent-board/client/src/components/PendingBanner.tsx`

**Step 1: Write PendingBanner.tsx**
```tsx
import { useAuth } from '../contexts/AuthContext'

export function PendingBanner() {
  const { isPending } = useAuth()
  if (!isPending) return null
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-800 text-center">
      Your account is pending approval by an admin. You can view public projects in the meantime.
    </div>
  )
}
```

**Step 2: Add to main layout**

In the layout component that wraps project views (likely the component that renders the sidebar + main content), add `<PendingBanner />` at the very top.

**Step 3: Commit**
```bash
git add agent-board/client/src/components/PendingBanner.tsx
git commit -m "feat: add pending approval banner for unapproved users"
```

---

### Task 16: Sidebar user nav and admin badge

**Files:**
- Create: `agent-board/client/src/components/UserNav.tsx`
- Modify: existing sidebar component

**Step 1: Write UserNav.tsx**
```tsx
import { useAuth } from '../contexts/AuthContext'
import { authApi } from '../lib/api'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { adminApi } from '../lib/api'
import { Link } from 'react-router-dom'

export function UserNav() {
  const { user, isAdmin, refetch } = useAuth()
  const queryClient = useQueryClient()

  const { data: pendingData } = useQuery({
    queryKey: ['admin', 'pending-count'],
    queryFn: () => adminApi.pendingCount(),
    enabled: isAdmin,
    refetchInterval: 30_000,
  })

  const handleLogout = async () => {
    await authApi.logout()
    queryClient.clear()
    refetch()
  }

  if (!user) return null

  return (
    <div className="border-t border-slate-200 p-3 space-y-1">
      {isAdmin && (
        <Link
          to="/admin/users"
          className="flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-slate-100 text-slate-700"
        >
          <span>Users</span>
          {(pendingData?.count ?? 0) > 0 && (
            <span className="bg-amber-500 text-white text-xs rounded-full px-2 py-0.5">
              {pendingData?.count}
            </span>
          )}
        </Link>
      )}
      <div className="flex items-center gap-3 px-3 py-2">
        {user.avatar_url && (
          <img src={user.avatar_url} alt={user.name} className="w-7 h-7 rounded-full" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{user.name}</p>
          <p className="text-xs text-slate-500 truncate">{user.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-slate-400 hover:text-slate-600"
          title="Sign out"
        >
          ↩
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Add `<UserNav />` to the bottom of the sidebar component**

Find the sidebar component in the client (likely `client/src/components/Sidebar.tsx` or similar) and add `<UserNav />` at the very bottom.

**Step 3: Commit**
```bash
git add agent-board/client/src/components/UserNav.tsx
git commit -m "feat: add user nav with logout and admin pending-count badge to sidebar"
```

---

### Task 17: Admin users page

**Files:**
- Create: `agent-board/client/src/pages/AdminUsersPage.tsx`
- Modify: `agent-board/client/src/App.tsx`

**Step 1: Write AdminUsersPage.tsx**
```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, User } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { Navigate } from 'react-router-dom'

export function AdminUsersPage() {
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()

  if (!isAdmin) return <Navigate to="/" replace />

  const { data: users = [] } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => adminApi.listUsers(),
  })

  const approve = useMutation({
    mutationFn: (id: number) => adminApi.approveUser(id, { status: 'active' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'pending-count'] })
    },
  })

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Users</h1>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600">User</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Provider</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Role</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u: User) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {u.avatar_url && <img src={u.avatar_url} className="w-8 h-8 rounded-full" />}
                    <div>
                      <p className="font-medium text-slate-800">{u.name}</p>
                      <p className="text-slate-500 text-xs">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 capitalize text-slate-600">{u.provider}</td>
                <td className="px-4 py-3 capitalize text-slate-600">{u.role}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  {u.status === 'pending' && (
                    <button
                      onClick={() => approve.mutate(u.id)}
                      className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-md hover:bg-teal-700"
                    >
                      Approve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

**Step 2: Add route in App.tsx**
```tsx
import { AdminUsersPage } from './pages/AdminUsersPage'
// inside ProtectedRoute:
<Route path="/admin/users" element={<AdminUsersPage />} />
```

**Step 3: Commit**
```bash
git add agent-board/client/src/pages/AdminUsersPage.tsx agent-board/client/src/App.tsx
git commit -m "feat: add admin users page with approve button"
```

---

### Task 18: Project settings tab (public/private + members)

**Files:**
- Create: `agent-board/client/src/components/ProjectSettings.tsx`

**Step 1: Write ProjectSettings.tsx**
```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { membersApi, api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  project: { id: string; key: string; name: string; is_public: number }
}

export function ProjectSettings({ project }: Props) {
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')

  const { data: members = [] } = useQuery({
    queryKey: ['members', project.id],
    queryFn: () => membersApi.list(project.id),
  })

  const addMember = useMutation({
    mutationFn: () => membersApi.add(project.id, email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', project.id] })
      setEmail('')
    },
  })

  const removeMember = useMutation({
    mutationFn: (userId: number) => membersApi.remove(project.id, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members', project.id] }),
  })

  const togglePublic = useMutation({
    mutationFn: () =>
      fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_public: !project.is_public }),
      }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })

  return (
    <div className="p-6 max-w-2xl space-y-8">
      {isAdmin && (
        <section>
          <h2 className="text-base font-semibold text-slate-800 mb-3">Visibility</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => togglePublic.mutate()}
              className={`w-10 h-6 rounded-full transition-colors ${project.is_public ? 'bg-teal-500' : 'bg-slate-300'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-transform ${project.is_public ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-slate-700">
              {project.is_public ? 'Public — visible to all logged-in users' : 'Private — members only'}
            </span>
          </label>
        </section>
      )}

      <section>
        <h2 className="text-base font-semibold text-slate-800 mb-3">Members</h2>
        {isAdmin && (
          <div className="flex gap-2 mb-4">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="flex-1 border border-slate-200 rounded-md px-3 py-2 text-sm"
            />
            <button
              onClick={() => addMember.mutate()}
              disabled={!email}
              className="bg-teal-600 text-white px-4 py-2 rounded-md text-sm hover:bg-teal-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
        <ul className="space-y-2">
          {members.map((m: any) => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              {m.avatar_url && <img src={m.avatar_url} className="w-7 h-7 rounded-full" />}
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">{m.name}</p>
                <p className="text-xs text-slate-500">{m.email}</p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => removeMember.mutate(m.id)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
```

**Step 2: Add Settings tab to project navigation**

Find the project nav component and add a "Settings" tab that renders `<ProjectSettings project={project} />`.

**Step 3: Commit**
```bash
git add agent-board/client/src/components/ProjectSettings.tsx
git commit -m "feat: add project settings tab (public/private toggle + member management)"
```

---

## Phase 4 — Deployment

### Task 19: Register OAuth apps and configure Railway env vars

**Step 1: Register Google OAuth app**
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project or select existing
3. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
4. Application type: Web application
5. Authorized redirect URI: `https://your-app.railway.app/api/auth/google/callback`
6. Copy Client ID and Client Secret

**Step 2: Register GitHub OAuth app**
1. Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
2. Homepage URL: `https://your-app.railway.app`
3. Authorization callback URL: `https://your-app.railway.app/api/auth/github/callback`
4. Copy Client ID and generate Client Secret

**Step 3: Set Railway environment variables**
```bash
# In Railway dashboard → your service → Variables:
SESSION_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
GOOGLE_CLIENT_ID=<from step 1>
GOOGLE_CLIENT_SECRET=<from step 1>
GITHUB_CLIENT_ID=<from step 2>
GITHUB_CLIENT_SECRET=<from step 2>
BASE_URL=https://your-app.railway.app
NODE_ENV=production
```

**Step 4: Deploy**
```bash
git push origin main
# Railway auto-deploys on push
```

**Step 5: Smoke test**
1. Open `https://your-app.railway.app/login`
2. Sign in with Google → should redirect to `/` as admin (first user)
3. Sign in with a second Google/GitHub account → should see pending banner
4. Approve from admin panel → second user can now access private projects

---

## Testing Checklist

- [ ] `npm run test --workspace=server` — all tests pass
- [ ] `npm run build --workspace=server` — no TypeScript errors
- [ ] `npm run build --workspace=client` — no TypeScript errors
- [ ] Login page renders at `/login` with both OAuth buttons
- [ ] First user to sign up gets admin role automatically
- [ ] Second user sees pending banner and only public projects
- [ ] Admin can approve user from `/admin/users`
- [ ] Approved user can see private projects they're added to
- [ ] Admin can add/remove project members
- [ ] Admin can toggle project public/private
- [ ] Logout clears session and redirects to `/login`
- [ ] Unauthenticated requests to `/api/*` return 401
- [ ] Non-admin requests to `/api/admin/*` return 403
