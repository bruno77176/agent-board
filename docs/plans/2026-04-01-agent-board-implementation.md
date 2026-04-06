# Agent Board Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full-stack Jira-like ticketing board where Claude Code typed agents (Tess Ter, Arch Lee, etc.) update tickets in real time via MCP, visible to teammates in a browser.

**Architecture:** Deployed Express app serves a React SPA + REST API + WebSocket server, backed by SQLite. A local MCP server (stdio) is installed once in Claude Code and calls the deployed app's REST API. The `board-workflow` skill maps superpowers skills to agent identities and MCP tool calls.

**Tech Stack:** Node.js + Express + SQLite (better-sqlite3) + ws / React + Vite + TypeScript + Tailwind CSS + shadcn/ui + TanStack Query / Node.js MCP server (stdio)

---

## Project Structure

```
agent-board/
├── server/              # Express app (API + serves client build)
│   ├── src/
│   │   ├── db/          # Schema, migrations, seed
│   │   ├── routes/      # REST endpoints
│   │   ├── ws/          # WebSocket server
│   │   └── index.ts
│   ├── tests/
│   └── package.json
├── client/              # React + Vite app
│   ├── src/
│   │   ├── components/
│   │   ├── views/
│   │   ├── hooks/
│   │   └── main.tsx
│   └── package.json
├── mcp/                 # Local MCP server
│   ├── src/
│   │   ├── tools/
│   │   └── index.ts
│   └── package.json
└── docs/
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `server/package.json`
- Create: `client/package.json`
- Create: `mcp/package.json`
- Create: `package.json` (root, workspaces)
- Create: `.gitignore`

**Step 1: Initialize root package**

```bash
cd /c/Users/bruno.moise/agent-jira
mkdir agent-board && cd agent-board
git init
```

**Step 2: Create root package.json**

```json
{
  "name": "agent-board",
  "private": true,
  "workspaces": ["server", "client", "mcp"],
  "scripts": {
    "dev:server": "npm run dev --workspace=server",
    "dev:client": "npm run dev --workspace=client",
    "build": "npm run build --workspace=client && npm run build --workspace=server",
    "start": "npm run start --workspace=server"
  }
}
```

**Step 3: Scaffold server**

```bash
mkdir -p server/src/db server/src/routes server/src/ws server/tests
cat > server/package.json << 'EOF'
{
  "name": "agent-board-server",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^9.4.3",
    "cors": "^2.8.5",
    "express": "^4.18.3",
    "ws": "^8.16.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/ws": "^8.5.10",
    "tsx": "^4.7.1",
    "typescript": "^5.4.2",
    "vitest": "^1.3.1"
  }
}
EOF
```

**Step 4: Scaffold client**

```bash
cd client
npm create vite@latest . -- --template react-ts
```

**Step 5: Scaffold MCP**

```bash
mkdir -p mcp/src/tools
cat > mcp/package.json << 'EOF'
{
  "name": "agent-board-mcp",
  "version": "1.0.0",
  "type": "module",
  "bin": { "agent-board-mcp": "./dist/index.js" },
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "node-fetch": "^3.3.2"
  },
  "devDependencies": {
    "tsx": "^4.7.1",
    "typescript": "^5.4.2"
  }
}
EOF
```

**Step 6: Create .gitignore**

```
node_modules/
dist/
*.db
.env
client/dist/
```

**Step 7: Install dependencies**

```bash
npm install
```

Expected: all three workspaces install successfully.

**Step 8: Commit**

```bash
git add .
git commit -m "feat: scaffold monorepo (server, client, mcp)"
```

---

## Task 2: Database schema

**Files:**
- Create: `server/src/db/schema.ts`
- Create: `server/src/db/index.ts`
- Test: `server/tests/db.test.ts`

**Step 1: Write failing test**

```typescript
// server/tests/db.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getDb, closeDb } from '../src/db/index'

describe('database schema', () => {
  beforeEach(() => closeDb())

  it('creates all tables on init', () => {
    const db = getDb(':memory:')
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name)

    expect(tables).toContain('projects')
    expect(tables).toContain('epics')
    expect(tables).toContain('features')
    expect(tables).toContain('stories')
    expect(tables).toContain('agents')
    expect(tables).toContain('workflows')
    expect(tables).toContain('events')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd server && npx vitest run tests/db.test.ts
```

Expected: FAIL — `getDb` not found.

**Step 3: Write schema**

```typescript
// server/src/db/schema.ts
export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    states TEXT NOT NULL,       -- JSON array of {id, label, color}
    transitions TEXT NOT NULL   -- JSON array of {from, to, label}
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    workflow_id TEXT NOT NULL REFERENCES workflows(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    scope TEXT,
    color TEXT NOT NULL,
    avatar_emoji TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS epics (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    description TEXT,
    version TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS features (
    id TEXT PRIMARY KEY,
    epic_id TEXT NOT NULL REFERENCES epics(id),
    title TEXT NOT NULL,
    description TEXT,
    tags TEXT NOT NULL DEFAULT '[]',  -- JSON array
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    tags TEXT NOT NULL DEFAULT '[]',   -- JSON array
    estimated_minutes INTEGER,
    git_branch TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL DEFAULT 'story',  -- 'story' | 'feature' | 'epic'
    target_id TEXT NOT NULL,
    agent_id TEXT REFERENCES agents(id),
    from_status TEXT,   -- null for pure comments
    to_status TEXT,     -- null for pure comments
    comment TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;
```

**Step 4: Write db/index.ts**

```typescript
// server/src/db/index.ts
import Database from 'better-sqlite3'
import { SCHEMA } from './schema'
import path from 'path'

let db: Database.Database | null = null

export function getDb(dbPath?: string): Database.Database {
  if (db) return db
  const resolvedPath = dbPath ?? path.join(process.cwd(), 'data.db')
  db = new Database(resolvedPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}
```

**Step 5: Run test**

```bash
npx vitest run tests/db.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add server/src/db server/tests/db.test.ts
git commit -m "feat: sqlite schema (projects, epics, features, stories, agents, workflows, events)"
```

---

## Task 3: Seed data

**Files:**
- Create: `server/src/db/seed.ts`
- Test: `server/tests/seed.test.ts`

**Step 1: Write failing test**

```typescript
// server/tests/seed.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getDb, closeDb } from '../src/db/index'
import { seed } from '../src/db/seed'

describe('seed', () => {
  beforeEach(() => closeDb())

  it('inserts default workflows', () => {
    const db = getDb(':memory:')
    seed(db)
    const workflows = db.prepare('SELECT * FROM workflows').all()
    expect(workflows).toHaveLength(3)
  })

  it('inserts default agents', () => {
    const db = getDb(':memory:')
    seed(db)
    const agents = db.prepare('SELECT slug FROM agents').all() as {slug:string}[]
    const slugs = agents.map(a => a.slug)
    expect(slugs).toContain('tess-ter')
    expect(slugs).toContain('arch-lee')
    expect(slugs).toContain('dee-ploy')
  })

  it('is idempotent', () => {
    const db = getDb(':memory:')
    seed(db)
    seed(db)
    const agents = db.prepare('SELECT * FROM agents').all()
    expect(agents).toHaveLength(8)
  })
})
```

**Step 2: Run test — expect FAIL**

```bash
npx vitest run tests/seed.test.ts
```

**Step 3: Write seed.ts**

```typescript
// server/src/db/seed.ts
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

const WORKFLOWS = [
  {
    id: 'light',
    name: 'Light',
    states: [
      { id: 'backlog', label: 'Backlog', color: '#94a3b8' },
      { id: 'todo', label: 'To Do', color: '#60a5fa' },
      { id: 'in_progress', label: 'In Progress', color: '#34d399' },
      { id: 'done', label: 'Done', color: '#a78bfa' },
      { id: 'cancelled', label: 'Cancelled', color: '#f87171' },
    ],
    transitions: [
      { from: 'backlog', to: 'todo', label: 'Triage' },
      { from: 'todo', to: 'in_progress', label: 'Start Work' },
      { from: 'in_progress', to: 'done', label: 'Complete' },
      { from: 'done', to: 'todo', label: 'Reopen' },
      { from: 'backlog', to: 'cancelled', label: 'Cancel' },
      { from: 'todo', to: 'cancelled', label: 'Cancel' },
      { from: 'in_progress', to: 'cancelled', label: 'Cancel' },
    ],
  },
  {
    id: 'standard',
    name: 'Standard',
    states: [
      { id: 'backlog', label: 'Backlog', color: '#94a3b8' },
      { id: 'todo', label: 'To Do', color: '#60a5fa' },
      { id: 'in_progress', label: 'In Progress', color: '#34d399' },
      { id: 'review', label: 'Review', color: '#fb923c' },
      { id: 'qa', label: 'QA', color: '#f59e0b' },
      { id: 'done', label: 'Done', color: '#a78bfa' },
      { id: 'cancelled', label: 'Cancelled', color: '#f87171' },
    ],
    transitions: [
      { from: 'backlog', to: 'todo', label: 'Triage' },
      { from: 'todo', to: 'in_progress', label: 'Start Work' },
      { from: 'in_progress', to: 'review', label: 'Request Review' },
      { from: 'review', to: 'qa', label: 'Approve' },
      { from: 'review', to: 'in_progress', label: 'Request Changes' },
      { from: 'qa', to: 'done', label: 'Complete' },
      { from: 'qa', to: 'in_progress', label: 'Fail QA' },
      { from: 'done', to: 'todo', label: 'Reopen' },
      { from: 'backlog', to: 'cancelled', label: 'Cancel' },
      { from: 'todo', to: 'cancelled', label: 'Cancel' },
      { from: 'in_progress', to: 'cancelled', label: 'Cancel' },
    ],
  },
  {
    id: 'full',
    name: 'Full',
    states: [
      { id: 'backlog', label: 'Backlog', color: '#94a3b8' },
      { id: 'todo', label: 'To Do', color: '#60a5fa' },
      { id: 'in_progress', label: 'In Progress', color: '#34d399' },
      { id: 'review', label: 'Review', color: '#fb923c' },
      { id: 'qa', label: 'QA', color: '#f59e0b' },
      { id: 'security', label: 'Security', color: '#ef4444' },
      { id: 'done', label: 'Done', color: '#a78bfa' },
      { id: 'cancelled', label: 'Cancelled', color: '#f87171' },
    ],
    transitions: [
      { from: 'backlog', to: 'todo', label: 'Triage' },
      { from: 'todo', to: 'in_progress', label: 'Start Work' },
      { from: 'in_progress', to: 'review', label: 'Request Review' },
      { from: 'review', to: 'qa', label: 'Approve' },
      { from: 'review', to: 'in_progress', label: 'Request Changes' },
      { from: 'qa', to: 'security', label: 'Pass QA' },
      { from: 'qa', to: 'in_progress', label: 'Fail QA' },
      { from: 'security', to: 'done', label: 'Complete' },
      { from: 'security', to: 'in_progress', label: 'Fail Security' },
      { from: 'done', to: 'todo', label: 'Reopen' },
    ],
  },
]

const AGENTS = [
  { slug: 'arch-lee', name: 'Arch Lee', scope: 'Architecture & planning', color: '#6366f1', avatar_emoji: '🏛️' },
  { slug: 'tess-ter', name: 'Tess Ter', scope: 'Testing & QA', color: '#10b981', avatar_emoji: '🧪' },
  { slug: 'deb-ugg', name: 'Deb Ugg', scope: 'Debugging', color: '#f59e0b', avatar_emoji: '🐛' },
  { slug: 'rev-yu', name: 'Rev Yu', scope: 'Code review', color: '#3b82f6', avatar_emoji: '🔍' },
  { slug: 'dee-ploy', name: 'Dee Ploy', scope: 'Deployment & merge', color: '#8b5cf6', avatar_emoji: '🚀' },
  { slug: 'dev-in', name: 'Dev In', scope: 'Backend implementation', color: '#64748b', avatar_emoji: '⚙️' },
  { slug: 'fron-tina', name: 'Fron Tina', scope: 'Frontend implementation', color: '#ec4899', avatar_emoji: '🎨' },
  { slug: 'doc-tor', name: 'Doc Tor', scope: 'Documentation', color: '#0ea5e9', avatar_emoji: '📝' },
]

export function seed(db: Database.Database): void {
  const insertWorkflow = db.prepare(
    'INSERT OR IGNORE INTO workflows (id, name, states, transitions) VALUES (?, ?, ?, ?)'
  )
  for (const w of WORKFLOWS) {
    insertWorkflow.run(w.id, w.name, JSON.stringify(w.states), JSON.stringify(w.transitions))
  }

  const insertAgent = db.prepare(
    'INSERT OR IGNORE INTO agents (id, slug, name, scope, color, avatar_emoji) VALUES (?, ?, ?, ?, ?, ?)'
  )
  for (const a of AGENTS) {
    insertAgent.run(randomUUID(), a.slug, a.name, a.scope, a.color, a.avatar_emoji)
  }
}
```

**Step 4: Run test**

```bash
npx vitest run tests/seed.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add server/src/db/seed.ts server/tests/seed.test.ts
git commit -m "feat: seed default workflows (Light/Standard/Full) and 8 typed agents"
```

---

## Task 4: Express server + REST API scaffold

**Files:**
- Create: `server/src/index.ts`
- Create: `server/src/routes/index.ts`
- Create: `server/tsconfig.json`

**Step 1: Write tsconfig**

```json
// server/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

**Step 2: Write server entry point**

```typescript
// server/src/index.ts
import express from 'express'
import cors from 'cors'
import path from 'path'
import { createServer } from 'http'
import { getDb } from './db/index'
import { seed } from './db/seed'
import { createRouter } from './routes/index'
import { createWsServer } from './ws/index'

const app = express()
const server = createServer(app)
const PORT = process.env.PORT || 3000

const db = getDb()
seed(db)

app.use(cors())
app.use(express.json())

// WebSocket
const broadcast = createWsServer(server)

// API routes
app.use('/api', createRouter(db, broadcast))

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist')
  app.use(express.static(clientDist))
  app.get('*', (_, res) => res.sendFile(path.join(clientDist, 'index.html')))
}

server.listen(PORT, () => {
  console.log(`Agent Board running on http://localhost:${PORT}`)
})
```

**Step 3: Write routes/index.ts stub**

```typescript
// server/src/routes/index.ts
import { Router } from 'express'
import Database from 'better-sqlite3'
import { projectsRouter } from './projects'
import { agentsRouter } from './agents'
import { workflowsRouter } from './workflows'
import { epicsRouter } from './epics'
import { featuresRouter } from './features'
import { storiesRouter } from './stories'
import { eventsRouter } from './events'

export type Broadcast = (event: object) => void

export function createRouter(db: Database.Database, broadcast: Broadcast): Router {
  const router = Router()
  router.use('/projects', projectsRouter(db, broadcast))
  router.use('/agents', agentsRouter(db))
  router.use('/workflows', workflowsRouter(db))
  router.use('/epics', epicsRouter(db, broadcast))
  router.use('/features', featuresRouter(db, broadcast))
  router.use('/stories', storiesRouter(db, broadcast))
  router.use('/events', eventsRouter(db))
  return router
}
```

**Step 4: Write ws/index.ts**

```typescript
// server/src/ws/index.ts
import { WebSocketServer, WebSocket } from 'ws'
import { Server } from 'http'
import { Broadcast } from '../routes/index'

export function createWsServer(server: Server): Broadcast {
  const wss = new WebSocketServer({ server })

  function broadcast(event: object): void {
    const data = JSON.stringify(event)
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data)
      }
    }
  }

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'connected' }))
  })

  return broadcast
}
```

**Step 5: Start server to verify it boots**

```bash
npx tsx src/index.ts
```

Expected: `Agent Board running on http://localhost:3000`

**Step 6: Commit**

```bash
git add server/src/index.ts server/src/routes/index.ts server/src/ws/index.ts server/tsconfig.json
git commit -m "feat: express server with cors, ws broadcast, and route scaffold"
```

---

## Task 5: REST API — Projects + Agents + Workflows

**Files:**
- Create: `server/src/routes/projects.ts`
- Create: `server/src/routes/agents.ts`
- Create: `server/src/routes/workflows.ts`
- Test: `server/tests/routes.projects.test.ts`

**Step 1: Write failing test**

```typescript
// server/tests/routes.projects.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { getDb, closeDb } from '../src/db/index'
import { seed } from '../src/db/seed'
import { createRouter } from '../src/routes/index'

// npm install --save-dev supertest @types/supertest

function buildApp() {
  const db = getDb(':memory:')
  seed(db)
  const app = express()
  app.use(express.json())
  app.use('/api', createRouter(db, () => {}))
  return app
}

describe('GET /api/projects', () => {
  beforeEach(() => closeDb())

  it('returns empty array initially', async () => {
    const res = await request(buildApp()).get('/api/projects')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})

describe('POST /api/projects', () => {
  beforeEach(() => closeDb())

  it('creates a project', async () => {
    const app = buildApp()
    const res = await request(app).post('/api/projects').send({
      key: 'TEST',
      name: 'Test Project',
      workflow_id: 'standard',
    })
    expect(res.status).toBe(201)
    expect(res.body.key).toBe('TEST')
    expect(res.body.id).toBeTruthy()
  })

  it('rejects duplicate key', async () => {
    const app = buildApp()
    await request(app).post('/api/projects').send({ key: 'DUP', name: 'A', workflow_id: 'light' })
    const res = await request(app).post('/api/projects').send({ key: 'DUP', name: 'B', workflow_id: 'light' })
    expect(res.status).toBe(409)
  })
})
```

**Step 2: Install supertest**

```bash
npm install --save-dev supertest @types/supertest --workspace=server
```

**Step 3: Run test — expect FAIL**

```bash
npx vitest run tests/routes.projects.test.ts
```

**Step 4: Write projects.ts**

```typescript
// server/src/routes/projects.ts
import { Router } from 'express'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { Broadcast } from './index'

export function projectsRouter(db: Database.Database, broadcast: Broadcast): Router {
  const router = Router()

  router.get('/', (_, res) => {
    const rows = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all()
    res.json(rows)
  })

  router.get('/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
    if (!row) return res.status(404).json({ error: 'Not found' })
    res.json(row)
  })

  router.post('/', (req, res) => {
    const { key, name, description, workflow_id } = req.body
    if (!key || !name || !workflow_id) return res.status(400).json({ error: 'key, name, workflow_id required' })
    try {
      const id = randomUUID()
      db.prepare('INSERT INTO projects (id, key, name, description, workflow_id) VALUES (?, ?, ?, ?, ?)')
        .run(id, key.toUpperCase(), name, description ?? null, workflow_id)
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
      broadcast({ type: 'project.created', data: project })
      res.status(201).json(project)
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Project key already exists' })
      throw e
    }
  })

  return router
}
```

**Step 5: Write agents.ts**

```typescript
// server/src/routes/agents.ts
import { Router } from 'express'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export function agentsRouter(db: Database.Database): Router {
  const router = Router()

  router.get('/', (_, res) => {
    res.json(db.prepare('SELECT * FROM agents ORDER BY name').all())
  })

  router.post('/', (req, res) => {
    const { slug, name, scope, color, avatar_emoji } = req.body
    if (!slug || !name || !color || !avatar_emoji) {
      return res.status(400).json({ error: 'slug, name, color, avatar_emoji required' })
    }
    try {
      const id = randomUUID()
      db.prepare('INSERT INTO agents (id, slug, name, scope, color, avatar_emoji) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, slug, name, scope ?? null, color, avatar_emoji)
      res.status(201).json(db.prepare('SELECT * FROM agents WHERE id = ?').get(id))
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Agent slug already exists' })
      throw e
    }
  })

  return router
}
```

**Step 6: Write workflows.ts**

```typescript
// server/src/routes/workflows.ts
import { Router } from 'express'
import Database from 'better-sqlite3'

export function workflowsRouter(db: Database.Database): Router {
  const router = Router()

  router.get('/', (_, res) => {
    const rows = db.prepare('SELECT * FROM workflows').all() as any[]
    res.json(rows.map(r => ({
      ...r,
      states: JSON.parse(r.states),
      transitions: JSON.parse(r.transitions),
    })))
  })

  return router
}
```

**Step 7: Run tests**

```bash
npx vitest run tests/routes.projects.test.ts
```

Expected: PASS

**Step 8: Commit**

```bash
git add server/src/routes/projects.ts server/src/routes/agents.ts server/src/routes/workflows.ts server/tests/routes.projects.test.ts
git commit -m "feat: REST API for projects, agents, workflows with tests"
```

---

## Task 6: REST API — Epics, Features, Stories

**Files:**
- Create: `server/src/routes/epics.ts`
- Create: `server/src/routes/features.ts`
- Create: `server/src/routes/stories.ts`
- Create: `server/src/routes/events.ts`
- Test: `server/tests/routes.stories.test.ts`

**Step 1: Write failing test**

```typescript
// server/tests/routes.stories.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { getDb, closeDb } from '../src/db/index'
import { seed } from '../src/db/seed'
import { createRouter } from '../src/routes/index'

function buildApp() {
  const db = getDb(':memory:')
  seed(db)
  const app = express()
  app.use(express.json())
  app.use('/api', createRouter(db, () => {}))
  return { app, db }
}

async function createProjectEpicFeature(app: any) {
  const project = (await request(app).post('/api/projects').send({ key: 'TST', name: 'Test', workflow_id: 'standard' })).body
  const epic = (await request(app).post('/api/epics').send({ project_id: project.id, title: 'Epic 1', version: 'v0.0.1' })).body
  const feature = (await request(app).post('/api/features').send({ epic_id: epic.id, title: 'Feature 1' })).body
  return { project, epic, feature }
}

describe('stories', () => {
  beforeEach(() => closeDb())

  it('creates a story and returns it with status backlog', async () => {
    const { app } = buildApp()
    const { feature } = await createProjectEpicFeature(app)
    const res = await request(app).post('/api/stories').send({
      feature_id: feature.id,
      title: 'Build login form',
      estimated_minutes: 5,
    })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('backlog')
    expect(res.body.title).toBe('Build login form')
  })

  it('moves a story status', async () => {
    const { app } = buildApp()
    const { feature } = await createProjectEpicFeature(app)
    const story = (await request(app).post('/api/stories').send({ feature_id: feature.id, title: 'S1', estimated_minutes: 3 })).body
    const res = await request(app).patch(`/api/stories/${story.id}/status`).send({ status: 'in_progress', agent_id: null })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('in_progress')
  })
})
```

**Step 2: Run test — expect FAIL**

```bash
npx vitest run tests/routes.stories.test.ts
```

**Step 3: Write epics.ts**

```typescript
// server/src/routes/epics.ts
import { Router } from 'express'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { Broadcast } from './index'

export function epicsRouter(db: Database.Database, broadcast: Broadcast): Router {
  const router = Router()

  router.get('/', (req, res) => {
    const { project_id } = req.query
    const rows = project_id
      ? db.prepare('SELECT * FROM epics WHERE project_id = ? ORDER BY created_at DESC').all(project_id as string)
      : db.prepare('SELECT * FROM epics ORDER BY created_at DESC').all()
    res.json(rows)
  })

  router.post('/', (req, res) => {
    const { project_id, title, description, version } = req.body
    if (!project_id || !title) return res.status(400).json({ error: 'project_id and title required' })
    const id = randomUUID()
    db.prepare('INSERT INTO epics (id, project_id, title, description, version) VALUES (?, ?, ?, ?, ?)')
      .run(id, project_id, title, description ?? null, version ?? null)
    const epic = db.prepare('SELECT * FROM epics WHERE id = ?').get(id)
    broadcast({ type: 'epic.created', data: epic })
    res.status(201).json(epic)
  })

  return router
}
```

**Step 4: Write features.ts**

```typescript
// server/src/routes/features.ts
import { Router } from 'express'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { Broadcast } from './index'

export function featuresRouter(db: Database.Database, broadcast: Broadcast): Router {
  const router = Router()

  router.get('/', (req, res) => {
    const { epic_id } = req.query
    const rows = epic_id
      ? db.prepare('SELECT * FROM features WHERE epic_id = ? ORDER BY created_at').all(epic_id as string)
      : db.prepare('SELECT * FROM features ORDER BY created_at').all()
    res.json(rows.map((r: any) => ({ ...r, tags: JSON.parse(r.tags) })))
  })

  router.post('/', (req, res) => {
    const { epic_id, title, description, tags } = req.body
    if (!epic_id || !title) return res.status(400).json({ error: 'epic_id and title required' })
    const id = randomUUID()
    db.prepare('INSERT INTO features (id, epic_id, title, description, tags) VALUES (?, ?, ?, ?, ?)')
      .run(id, epic_id, title, description ?? null, JSON.stringify(tags ?? []))
    const feature = db.prepare('SELECT * FROM features WHERE id = ?').get(id) as any
    const result = { ...feature, tags: JSON.parse(feature.tags) }
    broadcast({ type: 'feature.created', data: result })
    res.status(201).json(result)
  })

  return router
}
```

**Step 5: Write stories.ts**

```typescript
// server/src/routes/stories.ts
import { Router } from 'express'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { Broadcast } from './index'

export function storiesRouter(db: Database.Database, broadcast: Broadcast): Router {
  const router = Router()

  router.get('/', (req, res) => {
    const { feature_id, project_id } = req.query
    let rows: any[]
    if (feature_id) {
      rows = db.prepare('SELECT * FROM stories WHERE feature_id = ? ORDER BY created_at').all(feature_id as string)
    } else if (project_id) {
      rows = db.prepare(`
        SELECT s.* FROM stories s
        JOIN features f ON s.feature_id = f.id
        JOIN epics e ON f.epic_id = e.id
        WHERE e.project_id = ?
        ORDER BY s.created_at DESC
      `).all(project_id as string)
    } else {
      rows = db.prepare('SELECT * FROM stories ORDER BY created_at DESC').all()
    }
    res.json(rows.map((r: any) => ({ ...r, tags: JSON.parse(r.tags) })))
  })

  router.get('/:id', (req, res) => {
    const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id) as any
    if (!story) return res.status(404).json({ error: 'Not found' })
    const events = db.prepare('SELECT * FROM events WHERE story_id = ? ORDER BY created_at').all(story.id)
    res.json({ ...story, tags: JSON.parse(story.tags), events })
  })

  router.post('/', (req, res) => {
    const { feature_id, title, description, priority, tags, estimated_minutes, parent_story_id } = req.body
    if (!feature_id || !title) return res.status(400).json({ error: 'feature_id and title required' })
    const id = randomUUID()
    db.prepare(`INSERT INTO stories (id, feature_id, parent_story_id, title, description, priority, tags, estimated_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, feature_id, parent_story_id ?? null, title, description ?? null,
           priority ?? 'medium', JSON.stringify(tags ?? []), estimated_minutes ?? null)
    const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(id) as any
    const result = { ...story, tags: JSON.parse(story.tags) }
    broadcast({ type: 'story.created', data: result })
    res.status(201).json(result)
  })

  router.patch('/:id/status', (req, res) => {
    const { status, agent_id, comment } = req.body
    if (!status) return res.status(400).json({ error: 'status required' })
    const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id) as any
    if (!story) return res.status(404).json({ error: 'Not found' })
    db.prepare('UPDATE stories SET status = ?, assigned_agent_id = COALESCE(?, assigned_agent_id) WHERE id = ?')
      .run(status, agent_id ?? null, story.id)
    db.prepare('INSERT INTO events (id, story_id, agent_id, from_status, to_status, comment) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), story.id, agent_id ?? null, story.status, status, comment ?? null)
    const updated = db.prepare('SELECT * FROM stories WHERE id = ?').get(story.id) as any
    const result = { ...updated, tags: JSON.parse(updated.tags) }
    broadcast({ type: 'story.status_changed', data: result })
    res.json(result)
  })

  router.patch('/:id', (req, res) => {
    const { title, description, priority, tags, git_branch, assigned_agent_id } = req.body
    const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id) as any
    if (!story) return res.status(404).json({ error: 'Not found' })
    db.prepare(`UPDATE stories SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      priority = COALESCE(?, priority),
      tags = COALESCE(?, tags),
      git_branch = COALESCE(?, git_branch),
      assigned_agent_id = COALESCE(?, assigned_agent_id)
      WHERE id = ?`).run(
        title ?? null, description ?? null, priority ?? null,
        tags ? JSON.stringify(tags) : null, git_branch ?? null,
        assigned_agent_id ?? null, story.id
    )
    const updated = db.prepare('SELECT * FROM stories WHERE id = ?').get(story.id) as any
    const result = { ...updated, tags: JSON.parse(updated.tags) }
    broadcast({ type: 'story.updated', data: result })
    res.json(result)
  })

  return router
}
```

**Step 6: Write events.ts**

```typescript
// server/src/routes/events.ts
import { Router } from 'express'
import Database from 'better-sqlite3'

export function eventsRouter(db: Database.Database): Router {
  const router = Router()

  router.get('/', (req, res) => {
    const { story_id } = req.query
    const rows = story_id
      ? db.prepare('SELECT * FROM events WHERE story_id = ? ORDER BY created_at DESC').all(story_id as string)
      : db.prepare('SELECT * FROM events ORDER BY created_at DESC LIMIT 100').all()
    res.json(rows)
  })

  return router
}
```

**Step 7: Run tests**

```bash
npx vitest run tests/routes.stories.test.ts
```

Expected: PASS

**Step 8: Commit**

```bash
git add server/src/routes/ server/tests/routes.stories.test.ts
git commit -m "feat: REST API for epics, features, stories, events with status transitions"
```

---

## Task 7: React + shadcn/ui scaffold

**Files:**
- Modify: `client/package.json`
- Create: `client/src/lib/utils.ts`
- Create: `client/src/components/ui/` (shadcn components)
- Create: `client/tailwind.config.js`

**Step 1: Install Tailwind + shadcn dependencies**

```bash
cd client
npm install tailwindcss @tailwindcss/vite autoprefixer
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select @radix-ui/react-badge @radix-ui/react-separator @radix-ui/react-avatar @radix-ui/react-scroll-area
npm install class-variance-authority clsx tailwind-merge lucide-react
npm install @tanstack/react-query
npm install -D @types/node
```

**Step 2: Configure Tailwind (vite.config.ts)**

```typescript
// client/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { proxy: { '/api': 'http://localhost:3000', '/ws': { target: 'ws://localhost:3000', ws: true } } },
})
```

**Step 3: Initialize shadcn**

```bash
npx shadcn@latest init
```

When prompted: TypeScript=yes, style=Default, base color=Slate, CSS variables=yes, React Server Components=no.

**Step 4: Add core shadcn components**

```bash
npx shadcn@latest add button badge card dialog dropdown-menu input label select separator avatar scroll-area tabs tooltip
```

**Step 5: Write API client**

```typescript
// client/src/lib/api.ts
const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const api = {
  projects: {
    list: () => request<Project[]>('/projects'),
    create: (data: Partial<Project>) => request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  },
  agents: {
    list: () => request<Agent[]>('/agents'),
  },
  workflows: {
    list: () => request<Workflow[]>('/workflows'),
  },
  epics: {
    list: (project_id: string) => request<Epic[]>(`/epics?project_id=${project_id}`),
    create: (data: Partial<Epic>) => request<Epic>('/epics', { method: 'POST', body: JSON.stringify(data) }),
  },
  features: {
    list: (epic_id: string) => request<Feature[]>(`/features?epic_id=${epic_id}`),
  },
  stories: {
    list: (project_id: string) => request<Story[]>(`/stories?project_id=${project_id}`),
    get: (id: string) => request<Story>(`/stories/${id}`),
    create: (data: Partial<Story>) => request<Story>('/stories', { method: 'POST', body: JSON.stringify(data) }),
    moveStatus: (id: string, status: string, agent_id?: string, comment?: string) =>
      request<Story>(`/stories/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, agent_id, comment }) }),
  },
}

// Types
export interface Project { id: string; key: string; name: string; description?: string; workflow_id: string; created_at: string }
export interface Agent { id: string; slug: string; name: string; scope?: string; color: string; avatar_emoji: string }
export interface Workflow { id: string; name: string; states: WorkflowState[]; transitions: WorkflowTransition[] }
export interface WorkflowState { id: string; label: string; color: string }
export interface WorkflowTransition { from: string; to: string; label: string }
export interface Epic { id: string; project_id: string; title: string; version?: string; status: string; created_at: string }
export interface Feature { id: string; epic_id: string; title: string; tags: string[]; created_at: string }
export interface Story { id: string; feature_id: string; title: string; status: string; priority: string; assigned_agent_id?: string; tags: string[]; estimated_minutes?: number; git_branch?: string; events?: Event[]; created_at: string }
export interface Event { id: string; story_id: string; agent_id?: string; from_status?: string; to_status?: string; comment?: string; created_at: string }
```

**Step 6: Write WebSocket hook**

```typescript
// client/src/hooks/useBoard.ts
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export function useBoard() {
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}`)
    wsRef.current = ws

    ws.onmessage = (e) => {
      const event = JSON.parse(e.data)
      // Invalidate relevant query caches on any board event
      if (event.type?.startsWith('story.')) queryClient.invalidateQueries({ queryKey: ['stories'] })
      if (event.type?.startsWith('epic.')) queryClient.invalidateQueries({ queryKey: ['epics'] })
      if (event.type?.startsWith('project.')) queryClient.invalidateQueries({ queryKey: ['projects'] })
    }

    return () => ws.close()
  }, [queryClient])
}
```

**Step 7: Write main.tsx**

```typescript
// client/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
```

**Step 8: Verify client builds**

```bash
npm run build
```

Expected: build succeeds.

**Step 9: Commit**

```bash
git add client/
git commit -m "feat: react + shadcn/ui scaffold with api client and ws hook"
```

---

## Task 8: Board view — Kanban

**Files:**
- Create: `client/src/views/BoardView.tsx`
- Create: `client/src/components/StoryCard.tsx`
- Create: `client/src/components/KanbanColumn.tsx`
- Create: `client/src/App.tsx`

**Step 1: Write App.tsx with navigation**

```typescript
// client/src/App.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, Project, Epic } from './lib/api'
import { useBoard } from './hooks/useBoard'
import { BoardView } from './views/BoardView'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function App() {
  useBoard() // connect WebSocket
  const [projectId, setProjectId] = useState<string>('')
  const [epicId, setEpicId] = useState<string>('')
  const [view, setView] = useState<'board' | 'list' | 'backlog'>('board')

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list })
  const { data: epics = [] } = useQuery({
    queryKey: ['epics', projectId],
    queryFn: () => api.epics.list(projectId),
    enabled: !!projectId,
  })

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="border-b px-4 py-2 flex items-center gap-4 bg-white">
        <span className="font-semibold text-sm text-slate-800">Agent Board</span>
        <div className="h-4 w-px bg-slate-200" />
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="Project" /></SelectTrigger>
          <SelectContent>
            {projects.map((p: Project) => <SelectItem key={p.id} value={p.id}>{p.key} — {p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {projectId && (
          <Select value={epicId} onValueChange={setEpicId}>
            <SelectTrigger className="w-52 h-8 text-sm"><SelectValue placeholder="Epic" /></SelectTrigger>
            <SelectContent>
              {epics.map((e: Epic) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="ml-auto flex gap-1">
          {(['board', 'list', 'backlog'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1 text-xs rounded-md capitalize ${view === v ? 'bg-slate-100 font-medium' : 'text-slate-500 hover:bg-slate-50'}`}>
              {v}
            </button>
          ))}
        </div>
      </header>
      {/* Main */}
      <main className="flex-1 overflow-hidden">
        {projectId ? <BoardView projectId={projectId} epicId={epicId} view={view} />
          : <div className="flex items-center justify-center h-full text-slate-400 text-sm">Select a project to get started</div>}
      </main>
    </div>
  )
}
```

**Step 2: Write StoryCard.tsx**

```typescript
// client/src/components/StoryCard.tsx
import { Story, Agent } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const PRIORITY_COLOR: Record<string, string> = {
  high: 'text-red-600 bg-red-50 border-red-200',
  medium: 'text-amber-600 bg-amber-50 border-amber-200',
  low: 'text-slate-500 bg-slate-50 border-slate-200',
}

interface Props {
  story: Story
  agent?: Agent
  onClick?: () => void
}

export function StoryCard({ story, agent, onClick }: Props) {
  return (
    <div onClick={onClick}
      className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow-md hover:border-slate-300 cursor-pointer transition-all group">
      <p className="text-sm text-slate-800 font-medium leading-snug mb-2">{story.title}</p>
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {story.tags.map(tag => (
          <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{tag}</Badge>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${PRIORITY_COLOR[story.priority] ?? ''}`}>
          {story.priority}
        </span>
        <div className="flex items-center gap-1.5">
          {story.git_branch && (
            <span className="text-[10px] text-slate-400 font-mono truncate max-w-[80px]">{story.git_branch}</span>
          )}
          {agent && (
            <Avatar className="h-5 w-5 text-[10px]" style={{ backgroundColor: agent.color + '20', border: `1.5px solid ${agent.color}` }}>
              <AvatarFallback style={{ color: agent.color, backgroundColor: 'transparent', fontSize: 10 }}>
                {agent.avatar_emoji}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </div>
  )
}
```

**Step 3: Write KanbanColumn.tsx**

```typescript
// client/src/components/KanbanColumn.tsx
import { WorkflowState, Story, Agent } from '@/lib/api'
import { StoryCard } from './StoryCard'

interface Props {
  state: WorkflowState
  stories: Story[]
  agents: Agent[]
  onCardClick: (story: Story) => void
}

export function KanbanColumn({ state, stories, agents, onCardClick }: Props) {
  const agentMap = Object.fromEntries(agents.map(a => [a.id, a]))
  return (
    <div className="flex flex-col w-64 flex-shrink-0">
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: state.color }} />
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{state.label}</span>
        <span className="ml-auto text-xs text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5">{stories.length}</span>
      </div>
      {/* Cards */}
      <div className="flex flex-col gap-2 flex-1 min-h-[40px]">
        {stories.map(story => (
          <StoryCard key={story.id} story={story}
            agent={story.assigned_agent_id ? agentMap[story.assigned_agent_id] : undefined}
            onClick={() => onCardClick(story)} />
        ))}
      </div>
    </div>
  )
}
```

**Step 4: Write BoardView.tsx**

```typescript
// client/src/views/BoardView.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, Story, Workflow } from '@/lib/api'
import { KanbanColumn } from '@/components/KanbanColumn'

interface Props { projectId: string; epicId: string; view: 'board' | 'list' | 'backlog' }

export function BoardView({ projectId, view }: Props) {
  const [selectedStory, setSelectedStory] = useState<Story | null>(null)

  const { data: stories = [] } = useQuery({
    queryKey: ['stories', projectId],
    queryFn: () => api.stories.list(projectId),
    enabled: !!projectId,
    refetchInterval: false,
  })

  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: api.agents.list })

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list })
  const project = projects.find((p: any) => p.id === projectId)

  const { data: workflows = [] } = useQuery({ queryKey: ['workflows'], queryFn: api.workflows.list })
  const workflow: Workflow | undefined = workflows.find((w: any) => w.id === project?.workflow_id)

  if (!workflow) return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading...</div>

  if (view === 'board') {
    return (
      <div className="h-full overflow-x-auto">
        <div className="flex gap-4 p-6 h-full min-w-max">
          {workflow.states.map(state => (
            <KanbanColumn
              key={state.id}
              state={state}
              stories={stories.filter((s: Story) => s.status === state.id)}
              agents={agents}
              onCardClick={setSelectedStory}
            />
          ))}
        </div>
      </div>
    )
  }

  if (view === 'list') {
    return (
      <div className="p-6 overflow-y-auto h-full">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-xs text-slate-500 uppercase tracking-wide">
              <th className="text-left pb-2 font-medium">Title</th>
              <th className="text-left pb-2 font-medium">Status</th>
              <th className="text-left pb-2 font-medium">Priority</th>
              <th className="text-left pb-2 font-medium">Agent</th>
            </tr>
          </thead>
          <tbody>
            {stories.map((s: Story) => {
              const agent = agents.find((a: any) => a.id === s.assigned_agent_id)
              const state = workflow.states.find(st => st.id === s.status)
              return (
                <tr key={s.id} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedStory(s)}>
                  <td className="py-2.5 font-medium text-slate-800">{s.title}</td>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-1 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: state?.color }} />
                      {state?.label ?? s.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-xs text-slate-500 capitalize">{s.priority}</td>
                  <td className="py-2.5 text-xs text-slate-500">{agent ? `${agent.avatar_emoji} ${agent.name}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // Backlog view
  const backlogStories = stories.filter((s: Story) => s.status === 'backlog')
  return (
    <div className="p-6 overflow-y-auto h-full">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">Backlog — {backlogStories.length} items</h2>
      <div className="flex flex-col gap-2 max-w-2xl">
        {backlogStories.map((s: Story) => {
          const agent = agents.find((a: any) => a.id === s.assigned_agent_id)
          return <div key={s.id} onClick={() => setSelectedStory(s)}
            className="flex items-center gap-3 p-3 bg-white border rounded-lg hover:border-slate-300 cursor-pointer">
            <span className="text-sm flex-1 text-slate-800">{s.title}</span>
            <span className="text-xs text-slate-400 capitalize">{s.priority}</span>
            {agent && <span className="text-sm">{agent.avatar_emoji}</span>}
          </div>
        })}
      </div>
    </div>
  )
}
```

**Step 5: Run both server and client to verify UI**

```bash
# Terminal 1
cd server && npx tsx src/index.ts
# Terminal 2
cd client && npm run dev
```

Open `http://localhost:5173` — board should render.

**Step 6: Commit**

```bash
git add client/src/
git commit -m "feat: kanban board view, list view, backlog view with real-time ws updates"
```

---

## Task 9: MCP server

**Files:**
- Create: `mcp/src/index.ts`
- Create: `mcp/src/tools/board.ts`
- Create: `mcp/src/tools/workflow.ts`
- Create: `mcp/tsconfig.json`

**Step 1: Write tsconfig**

```json
// mcp/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "node16",
    "moduleResolution": "node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**Step 2: Write board API client for MCP**

```typescript
// mcp/src/tools/board.ts
const BASE_URL = process.env.BOARD_URL ?? 'http://localhost:3000'

async function call(path: string, method = 'GET', body?: object) {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Board API error: ${res.status} ${await res.text()}`)
  return res.json()
}

export const board = {
  getBoard: (project_id: string) => call(`/stories?project_id=${project_id}`),
  getStory: (id: string) => call(`/stories/${id}`),
  listAgents: () => call('/agents'),
  createEpic: (data: object) => call('/epics', 'POST', data),
  createFeature: (data: object) => call('/features', 'POST', data),
  createStory: (data: object) => call('/stories', 'POST', data),
  moveStatus: (id: string, status: string, agent_id?: string, comment?: string) =>
    call(`/stories/${id}/status`, 'PATCH', { status, agent_id, comment }),
  updateStory: (id: string, data: object) => call(`/stories/${id}`, 'PATCH', data),
  addComment: (story_id: string, agent_id: string | undefined, comment: string) =>
    call('/events', 'POST', { story_id, agent_id, comment }),
}
```

**Step 3: Write MCP server entry**

```typescript
// mcp/src/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { board } from './tools/board.js'

const server = new McpServer({ name: 'agent-board', version: '1.0.0' })

// ── Board reading ──────────────────────────────────────────────────
server.tool('get_board',
  { project_id: z.string().describe('Project ID to fetch stories for') },
  async ({ project_id }) => {
    const stories = await board.getBoard(project_id)
    return { content: [{ type: 'text', text: JSON.stringify(stories, null, 2) }] }
  }
)

server.tool('get_story',
  { story_id: z.string() },
  async ({ story_id }) => {
    const story = await board.getStory(story_id)
    return { content: [{ type: 'text', text: JSON.stringify(story, null, 2) }] }
  }
)

server.tool('list_agents', {}, async () => {
  const agents = await board.listAgents()
  return { content: [{ type: 'text', text: JSON.stringify(agents, null, 2) }] }
})

// ── Creating work ──────────────────────────────────────────────────
server.tool('create_epic',
  { project_id: z.string(), title: z.string(), description: z.string().optional(), version: z.string().optional() },
  async (args) => {
    const epic = await board.createEpic(args)
    return { content: [{ type: 'text', text: `Epic created: ${epic.id} — ${epic.title}` }] }
  }
)

server.tool('create_feature',
  { epic_id: z.string(), title: z.string(), description: z.string().optional(), tags: z.array(z.string()).optional() },
  async (args) => {
    const feature = await board.createFeature(args)
    return { content: [{ type: 'text', text: `Feature created: ${feature.id} — ${feature.title}` }] }
  }
)

server.tool('create_story',
  {
    feature_id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    priority: z.enum(['high', 'medium', 'low']).optional(),
    tags: z.array(z.string()).optional(),
    estimated_minutes: z.number().optional(),
    parent_story_id: z.string().optional(),
  },
  async (args) => {
    if (args.estimated_minutes && args.estimated_minutes > 10) {
      return { content: [{ type: 'text', text: `⚠️ Warning: estimated_minutes=${args.estimated_minutes} exceeds 10-min guideline. Break this story down further, then retry.` }] }
    }
    const story = await board.createStory(args)
    return { content: [{ type: 'text', text: `Story created: ${story.id} — ${story.title}` }] }
  }
)

// ── Agent workflow ─────────────────────────────────────────────────
server.tool('start_story',
  { story_id: z.string(), agent_id: z.string() },
  async ({ story_id, agent_id }) => {
    const story = await board.moveStatus(story_id, 'in_progress', agent_id, 'Started work')
    return { content: [{ type: 'text', text: `Story "${story.title}" → In Progress (${agent_id})` }] }
  }
)

server.tool('move_story',
  { story_id: z.string(), status: z.string(), agent_id: z.string().optional(), comment: z.string().optional() },
  async ({ story_id, status, agent_id, comment }) => {
    const story = await board.moveStatus(story_id, status, agent_id, comment)
    return { content: [{ type: 'text', text: `Story "${story.title}" → ${status}` }] }
  }
)

server.tool('request_review',
  { story_id: z.string(), agent_id: z.string().optional() },
  async ({ story_id, agent_id }) => {
    const story = await board.moveStatus(story_id, 'review', agent_id, 'Requested review')
    return { content: [{ type: 'text', text: `Story "${story.title}" → Review` }] }
  }
)

server.tool('complete_story',
  {
    story_id: z.string(),
    agent_id: z.string().optional(),
    checklist_confirmed: z.boolean().describe('Must be true — confirm tests pass, code reviewed, no regressions'),
  },
  async ({ story_id, agent_id, checklist_confirmed }) => {
    if (!checklist_confirmed) {
      return { content: [{ type: 'text', text: '❌ Cannot complete story: checklist_confirmed must be true. Verify tests pass, code is reviewed, no regressions.' }] }
    }
    const story = await board.moveStatus(story_id, 'done', agent_id, 'Completed with checklist confirmed')
    return { content: [{ type: 'text', text: `Story "${story.title}" → Done ✅` }] }
  }
)

server.tool('escalate_story',
  { story_id: z.string(), agent_id: z.string().optional(), reason: z.string() },
  async ({ story_id, agent_id, reason }) => {
    const story = await board.getStory(story_id)
    await board.moveStatus(story_id, 'backlog', agent_id, `🚨 Escalated: ${reason}`)
    // Create a blocking arch-review story in the same feature
    const archStory = await board.createStory({
      feature_id: story.feature_id,
      title: `[ARCH REVIEW] ${story.title}`,
      description: `3 failures escalation from story ${story_id}.\n\nReason: ${reason}`,
      priority: 'high',
      tags: ['arch-review', 'blocked'],
    })
    return { content: [{ type: 'text', text: `🚨 Escalated. Original story returned to backlog. Arch review story created: ${archStory.id}` }] }
  }
)

server.tool('add_comment',
  {
    target_type: z.enum(['story', 'feature', 'epic']).describe('What you are commenting on'),
    target_id: z.string().describe('ID of the story, feature, or epic'),
    agent_id: z.string().optional(),
    comment: z.string().describe('The comment text — be descriptive for traceability'),
  },
  async ({ target_type, target_id, agent_id, comment }) => {
    await board.addComment(target_type, target_id, agent_id, comment)
    return { content: [{ type: 'text', text: `Comment added to ${target_type} ${target_id}.` }] }
  }
)

// ── Superpowers-specific ───────────────────────────────────────────
server.tool('create_tdd_cycle',
  { parent_story_id: z.string(), feature_id: z.string() },
  async ({ parent_story_id, feature_id }) => {
    const red = await board.createStory({ feature_id, parent_story_id, title: '🔴 RED — Write failing test', priority: 'high', estimated_minutes: 5 })
    const green = await board.createStory({ feature_id, parent_story_id, title: '🟢 GREEN — Make test pass', priority: 'high', estimated_minutes: 5 })
    const refactor = await board.createStory({ feature_id, parent_story_id, title: '🔵 REFACTOR — Clean up', priority: 'medium', estimated_minutes: 5 })
    return { content: [{ type: 'text', text: `TDD cycle created:\n  🔴 ${red.id}\n  🟢 ${green.id}\n  🔵 ${refactor.id}` }] }
  }
)

server.tool('link_worktree',
  { story_id: z.string(), git_branch: z.string() },
  async ({ story_id, git_branch }) => {
    await board.updateStory(story_id, { git_branch })
    return { content: [{ type: 'text', text: `Story linked to branch: ${git_branch}` }] }
  }
)

// ── Start ──────────────────────────────────────────────────────────
const transport = new StdioServerTransport()
await server.connect(transport)
```

**Step 4: Build MCP**

```bash
cd mcp && npm run build
```

Expected: `dist/index.js` created.

**Step 5: Test MCP locally (smoke test)**

```bash
# In server terminal, server is running
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | BOARD_URL=http://localhost:3000 node dist/index.js
```

Expected: JSON response listing all tools.

**Step 6: Commit**

```bash
git add mcp/
git commit -m "feat: MCP server with 14 tools (board reading, creating, workflow, superpowers)"
```

---

## Task 10: board-workflow skill

**Files:**
- Create: `skills/board-workflow.md`

**Step 1: Write the skill**

```markdown
<!-- skills/board-workflow.md -->
---
name: board-workflow
description: Maps superpowers skills to typed agent identities and board MCP tool calls. Load this skill alongside any superpowers skill when working on a project that uses Agent Board.
type: workflow
---

# Board Workflow

This skill tells you which agent identity to assume and which MCP tools to call at each moment in the development lifecycle.

## Agent Identity Map

When a superpowers skill is active, assume the corresponding agent identity for all MCP calls:

| Active skill | Your agent identity | agent_id to use |
|---|---|---|
| brainstorming, writing-plans | Arch Lee | `arch-lee` |
| test-driven-development | Tess Ter | `tess-ter` |
| systematic-debugging | Deb Ugg | `deb-ugg` |
| requesting-code-review, receiving-code-review | Rev Yu | `rev-yu` |
| finishing-a-development-branch | Dee Ploy | `dee-ploy` |
| executing-plans (backend) | Dev In | `dev-in` |
| frontend-design, executing-plans (frontend) | Fron Tina | `fron-tina` |
| doc-coauthoring | Doc Tor | `doc-tor` |

## When to Call MCP Tools

### After brainstorming design approved
```
create_epic(project_id, title, version)
create_feature(epic_id, title) — one per major component
create_story(feature_id, title, estimated_minutes) — one per plan step, max 10 min
```

### When starting a story
```
start_story(story_id, agent_id)
```

### When test-driven-development skill begins a cycle
```
create_tdd_cycle(parent_story_id, feature_id)
start_story(red_story_id, "tess-ter")
```
Then move each sub-story as you complete it.

### When using-git-worktrees creates a branch
```
link_worktree(story_id, git_branch)
```

### After 3 failed attempts (systematic-debugging rule)
```
escalate_story(story_id, "deb-ugg", reason)
```

### When requesting review
```
request_review(story_id, "rev-yu")
```

### Before marking any story done
```
complete_story(story_id, agent_id, checklist_confirmed: true)
```
Only pass `checklist_confirmed: true` if:
- All tests pass
- Code has been reviewed
- No regressions introduced

## Granularity Rule
Stories must be ≤ 10 minutes of estimated work. The MCP server will warn if `estimated_minutes > 10`.
Break stories down before creating them.
```

**Step 2: Commit**

```bash
git add skills/board-workflow.md
git commit -m "feat: board-workflow skill — maps superpowers skills to agent identities and MCP calls"
```

---

## Task 11: Deployment

**Files:**
- Create: `railway.json`
- Create: `server/src/build.ts` (copies client build)
- Modify: `server/package.json` (build script)

**Step 1: Write railway.json**

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "npm run start --workspace=server",
    "healthcheckPath": "/api/workflows",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

**Step 2: Update server build script to include client**

```json
// Add to server/package.json scripts:
"build": "cd ../client && npm run build && cd ../server && tsc"
```

**Step 3: Update Express to serve client correctly in prod**

Verify `server/src/index.ts` client path is correct:
```typescript
const clientDist = path.join(__dirname, '../../client/dist')
```

**Step 4: Add events POST route (needed for comments)**

```typescript
// Add to server/src/routes/events.ts
router.post('/', (req, res) => {
  const { story_id, agent_id, comment } = req.body
  if (!story_id || !comment) return res.status(400).json({ error: 'story_id and comment required' })
  const id = randomUUID()
  db.prepare('INSERT INTO events (id, story_id, agent_id, comment) VALUES (?, ?, ?, ?)')
    .run(id, story_id, agent_id ?? null, comment)
  res.status(201).json(db.prepare('SELECT * FROM events WHERE id = ?').get(id))
})
```

**Step 5: Push to GitHub and deploy**

```bash
git remote add origin <your-github-repo>
git push -u origin main
```

Then on Railway:
1. New project → Deploy from GitHub repo
2. Add volume mounted at `/app/data` (for SQLite persistence)
3. Set env var `NODE_ENV=production`
4. Deploy

**Step 6: Configure MCP in Claude Code**

Add to `~/.claude/settings.json`:
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

**Step 7: Final smoke test**

- Open deployed URL in browser
- Create a project via the UI (or via MCP: `create_epic`)
- Verify board renders
- Open a second browser tab — verify real-time updates work

**Step 8: Final commit**

```bash
git add railway.json
git commit -m "feat: railway deployment config"
git push
```

---

## Done

The system is live. Teammates open the URL, you work in Claude Code with agents that move tickets in real time.

**Next steps after deployment:**
- Add drag-and-drop to Kanban (dnd-kit)
- Add story detail panel (slide-over)
- Add project/epic creation UI
- Add agent registration UI
