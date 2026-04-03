# Recap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build Recap — an AI-powered meeting notes API + web app that extracts structured action items from raw meeting notes using Claude.

**Architecture:** Single Express.js server serves both the REST API and the built React frontend. SQLite via better-sqlite3 stores meetings and action items. Claude Haiku handles AI extraction, returning structured JSON that is parsed and stored.

**Tech Stack:** Node.js 20, Express.js, better-sqlite3, @anthropic-ai/sdk, uuid, Vitest, supertest, React 18, Vite, Tailwind CSS

---

### Task 1: Create RECAP project on the agent board

**Files:**
- No files — board setup only

**Step 1: Create the project**

Call the agent board MCP tool:
```
mcp__agent-board__create_project({
  key: "RECAP",
  name: "Recap",
  description: "AI-powered meeting notes processor — extracts action items from raw notes using Claude",
  workflow_id: "standard"
})
```

**Step 2: Create the four epics**

```
mcp__agent-board__create_epic({ project_id: "<RECAP id>", title: "Core API & Persistence", description: "Express setup, SQLite schema, CRUD endpoints", version: "v0.1.0" })
mcp__agent-board__create_epic({ project_id: "<RECAP id>", title: "AI Extraction Pipeline", description: "Claude integration, prompt design, JSON parsing", version: "v0.1.0" })
mcp__agent-board__create_epic({ project_id: "<RECAP id>", title: "Web Frontend", description: "Submission form, dashboard, meeting detail, owner view", version: "v0.1.0" })
mcp__agent-board__create_epic({ project_id: "<RECAP id>", title: "Action Item Tracking", description: "Status updates, owner filter, open item counts", version: "v0.1.0" })
```

**Step 3: Commit**
```bash
# Nothing to commit — board is external state
```

---

### Task 2: Scaffold the repo

**Files:**
- Create: `recap/package.json`
- Create: `recap/.env.example`
- Create: `recap/.gitignore`
- Create: `recap/server/index.js`
- Create: `recap/vitest.config.js`

**Step 1: Create directory and package.json**

```bash
mkdir -p recap/server/routes recap/server/services recap/server/__tests__
```

`recap/package.json`:
```json
{
  "name": "recap",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "node server/index.js",
    "dev": "node --watch server/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "build:client": "cd client && npm run build",
    "build": "npm run build:client"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.36.3",
    "better-sqlite3": "^11.9.1",
    "express": "^4.21.2",
    "uuid": "^11.1.0"
  },
  "devDependencies": {
    "supertest": "^7.0.0",
    "vitest": "^3.1.1"
  }
}
```

**Step 2: Create .env.example and .gitignore**

`recap/.env.example`:
```
PORT=3000
ANTHROPIC_API_KEY=your-key-here
DATABASE_PATH=./recap.db
```

`recap/.gitignore`:
```
node_modules/
*.db
.env
client/dist/
```

**Step 3: Create vitest config**

`recap/vitest.config.js`:
```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
})
```

**Step 4: Create minimal server entry**

`recap/server/index.js`:
```js
import express from 'express'

const app = express()
app.use(express.json())

app.get('/health', (req, res) => res.json({ status: 'ok' }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Recap listening on port ${PORT}`))

export { app }
```

**Step 5: Install dependencies**
```bash
cd recap && npm install
```

**Step 6: Verify server starts**
```bash
node server/index.js
# Expected: "Recap listening on port 3000"
# Ctrl+C to stop
```

**Step 7: Commit**
```bash
git init
git add package.json .env.example .gitignore server/index.js vitest.config.js
git commit -m "feat: scaffold Recap project"
```

---

### Task 3: Database schema

**Files:**
- Create: `recap/server/db.js`
- Create: `recap/server/__tests__/db.test.js`

**Step 1: Write failing test**

`recap/server/__tests__/db.test.js`:
```js
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, closeDb } from '../db.js'

describe('database', () => {
  let db

  beforeAll(() => {
    db = createDb(':memory:')
  })

  afterAll(() => {
    closeDb(db)
  })

  it('creates meetings table', () => {
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='meetings'"
    ).get()
    expect(row).toBeDefined()
    expect(row.name).toBe('meetings')
  })

  it('creates action_items table', () => {
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='action_items'"
    ).get()
    expect(row).toBeDefined()
    expect(row.name).toBe('action_items')
  })

  it('inserts and retrieves a meeting', () => {
    db.prepare(
      "INSERT INTO meetings (id, title, raw_notes, status, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run('test-id', 'Test Meeting', 'Some notes', 'done', new Date().toISOString())

    const row = db.prepare("SELECT * FROM meetings WHERE id = ?").get('test-id')
    expect(row.title).toBe('Test Meeting')
    expect(row.status).toBe('done')
  })
})
```

**Step 2: Run test to verify it fails**
```bash
cd recap && npm test -- db.test
# Expected: FAIL — createDb is not defined
```

**Step 3: Implement db.js**

`recap/server/db.js`:
```js
import Database from 'better-sqlite3'

export function createDb(path = process.env.DATABASE_PATH || './recap.db') {
  const db = new Database(path)

  db.exec(`
    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      raw_notes TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing',
      error TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS action_items (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL,
      description TEXT NOT NULL,
      owner TEXT NOT NULL,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      FOREIGN KEY (meeting_id) REFERENCES meetings(id)
    );
  `)

  return db
}

export function closeDb(db) {
  db.close()
}
```

**Step 4: Run test to verify it passes**
```bash
npm test -- db.test
# Expected: PASS (3 tests)
```

**Step 5: Commit**
```bash
git add server/db.js server/__tests__/db.test.js
git commit -m "feat: add SQLite schema with meetings and action_items tables"
```

---

### Task 4: POST /api/meetings and GET /api/meetings

**Files:**
- Create: `recap/server/routes/meetings.js`
- Create: `recap/server/__tests__/meetings.test.js`
- Modify: `recap/server/index.js`

**Step 1: Write failing tests**

`recap/server/__tests__/meetings.test.js`:
```js
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { createDb, closeDb } from '../db.js'

// Mock the extractor so tests don't call Claude
vi.mock('../services/extractor.js', () => ({
  extractActionItems: vi.fn().mockResolvedValue([
    { description: 'Write tests', owner: 'Alice', due_date: '2026-04-10' },
    { description: 'Deploy app', owner: 'Bob', due_date: null },
  ])
}))

let app, db

beforeAll(async () => {
  db = createDb(':memory:')
  const { createApp } = await import('../app.js')
  app = createApp(db)
})

afterAll(() => closeDb(db))

beforeEach(() => {
  db.prepare('DELETE FROM action_items').run()
  db.prepare('DELETE FROM meetings').run()
})

describe('POST /api/meetings', () => {
  it('creates a meeting and returns it with action items', async () => {
    const res = await request(app)
      .post('/api/meetings')
      .send({ title: 'Sprint Retro', raw_notes: 'Alice will write tests. Bob will deploy.' })

    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
    expect(res.body.title).toBe('Sprint Retro')
    expect(res.body.status).toBe('done')
    expect(res.body.action_items).toHaveLength(2)
    expect(res.body.action_items[0].owner).toBe('Alice')
  })

  it('returns 400 if raw_notes is missing', async () => {
    const res = await request(app).post('/api/meetings').send({ title: 'No notes' })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/meetings', () => {
  it('returns a list of meetings with open item counts', async () => {
    await request(app)
      .post('/api/meetings')
      .send({ title: 'Meeting A', raw_notes: 'Alice does X.' })

    const res = await request(app).get('/api/meetings')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].title).toBe('Meeting A')
    expect(res.body[0].open_count).toBeDefined()
  })
})

describe('GET /api/meetings/:id', () => {
  it('returns meeting detail with action items', async () => {
    const create = await request(app)
      .post('/api/meetings')
      .send({ title: 'Detail Test', raw_notes: 'Do stuff.' })

    const res = await request(app).get(`/api/meetings/${create.body.id}`)
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('Detail Test')
    expect(res.body.action_items).toHaveLength(2)
  })

  it('returns 404 for unknown meeting', async () => {
    const res = await request(app).get('/api/meetings/nonexistent')
    expect(res.status).toBe(404)
  })
})
```

**Step 2: Run to verify failure**
```bash
npm test -- meetings.test
# Expected: FAIL — app.js not found
```

**Step 3: Refactor index.js to export createApp**

`recap/server/app.js` (new file — extract app factory from index.js):
```js
import express from 'express'
import { meetingsRouter } from './routes/meetings.js'

export function createApp(db) {
  const app = express()
  app.use(express.json())

  app.get('/health', (req, res) => res.json({ status: 'ok' }))
  app.use('/api/meetings', meetingsRouter(db))

  return app
}
```

Update `recap/server/index.js`:
```js
import { createDb } from './db.js'
import { createApp } from './app.js'

const db = createDb()
const app = createApp(db)

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Recap listening on port ${PORT}`))
```

**Step 4: Create a stub extractor (will be replaced in Task 6)**

`recap/server/services/extractor.js`:
```js
export async function extractActionItems(rawNotes) {
  // Stub — will be implemented in Task 6
  return []
}
```

**Step 5: Implement meetings routes**

`recap/server/routes/meetings.js`:
```js
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { extractActionItems } from '../services/extractor.js'

export function meetingsRouter(db) {
  const router = Router()

  router.post('/', async (req, res) => {
    const { title, raw_notes } = req.body
    if (!raw_notes) return res.status(400).json({ error: 'raw_notes is required' })

    const id = uuidv4()
    const created_at = new Date().toISOString()
    const meetingTitle = title || `Meeting ${created_at.slice(0, 10)}`

    db.prepare(
      'INSERT INTO meetings (id, title, raw_notes, status, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, meetingTitle, raw_notes, 'processing', created_at)

    try {
      const items = await extractActionItems(raw_notes)

      const insertItem = db.prepare(
        'INSERT INTO action_items (id, meeting_id, description, owner, due_date, status) VALUES (?, ?, ?, ?, ?, ?)'
      )
      for (const item of items) {
        insertItem.run(uuidv4(), id, item.description, item.owner, item.due_date || null, 'open')
      }

      db.prepare("UPDATE meetings SET status = 'done' WHERE id = ?").run(id)
    } catch (err) {
      db.prepare("UPDATE meetings SET status = 'failed', error = ? WHERE id = ?").run(err.message, id)
    }

    const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id)
    const action_items = db.prepare('SELECT * FROM action_items WHERE meeting_id = ?').all(id)
    res.status(201).json({ ...meeting, action_items })
  })

  router.get('/', (req, res) => {
    const meetings = db.prepare(`
      SELECT m.*, COUNT(CASE WHEN a.status = 'open' THEN 1 END) as open_count
      FROM meetings m
      LEFT JOIN action_items a ON a.meeting_id = m.id
      GROUP BY m.id
      ORDER BY m.created_at DESC
    `).all()
    res.json(meetings)
  })

  router.get('/:id', (req, res) => {
    const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id)
    if (!meeting) return res.status(404).json({ error: 'Not found' })
    const action_items = db.prepare('SELECT * FROM action_items WHERE meeting_id = ?').all(req.params.id)
    res.json({ ...meeting, action_items })
  })

  return router
}
```

**Step 6: Run tests to verify they pass**
```bash
npm test -- meetings.test
# Expected: PASS (6 tests)
```

**Step 7: Commit**
```bash
git add server/app.js server/index.js server/routes/meetings.js server/services/extractor.js server/__tests__/meetings.test.js
git commit -m "feat: add meetings CRUD API with mocked extraction"
```

---

### Task 5: PATCH /api/action-items/:id and owner routes

**Files:**
- Create: `recap/server/routes/action-items.js`
- Create: `recap/server/routes/owners.js`
- Create: `recap/server/__tests__/action-items.test.js`
- Create: `recap/server/__tests__/owners.test.js`
- Modify: `recap/server/app.js`

**Step 1: Write failing tests for action items**

`recap/server/__tests__/action-items.test.js`:
```js
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { v4 as uuidv4 } from 'uuid'
import { createDb, closeDb } from '../db.js'
import { createApp } from '../app.js'

let app, db, meetingId, itemId

beforeAll(() => {
  db = createDb(':memory:')
  app = createApp(db)
})

afterAll(() => closeDb(db))

beforeEach(() => {
  db.prepare('DELETE FROM action_items').run()
  db.prepare('DELETE FROM meetings').run()
  meetingId = uuidv4()
  itemId = uuidv4()
  db.prepare(
    'INSERT INTO meetings (id, title, raw_notes, status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(meetingId, 'Test', 'notes', 'done', new Date().toISOString())
  db.prepare(
    'INSERT INTO action_items (id, meeting_id, description, owner, due_date, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(itemId, meetingId, 'Write tests', 'Alice', null, 'open')
})

describe('PATCH /api/action-items/:id', () => {
  it('updates action item status', async () => {
    const res = await request(app)
      .patch(`/api/action-items/${itemId}`)
      .send({ status: 'in_progress' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('in_progress')
  })

  it('rejects invalid status', async () => {
    const res = await request(app)
      .patch(`/api/action-items/${itemId}`)
      .send({ status: 'completed' })
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown item', async () => {
    const res = await request(app)
      .patch('/api/action-items/nonexistent')
      .send({ status: 'done' })
    expect(res.status).toBe(404)
  })
})
```

`recap/server/__tests__/owners.test.js`:
```js
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { v4 as uuidv4 } from 'uuid'
import { createDb, closeDb } from '../db.js'
import { createApp } from '../app.js'

let app, db

beforeAll(() => {
  db = createDb(':memory:')
  app = createApp(db)
})

afterAll(() => closeDb(db))

beforeEach(() => {
  db.prepare('DELETE FROM action_items').run()
  db.prepare('DELETE FROM meetings').run()
  const mid = uuidv4()
  db.prepare(
    'INSERT INTO meetings (id, title, raw_notes, status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(mid, 'Test', 'notes', 'done', new Date().toISOString())
  db.prepare(
    'INSERT INTO action_items (id, meeting_id, description, owner, due_date, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(uuidv4(), mid, 'Task A', 'Alice', null, 'open')
  db.prepare(
    'INSERT INTO action_items (id, meeting_id, description, owner, due_date, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(uuidv4(), mid, 'Task B', 'Bob', null, 'done')
})

describe('GET /api/owners', () => {
  it('returns distinct owner names', async () => {
    const res = await request(app).get('/api/owners')
    expect(res.status).toBe(200)
    expect(res.body.map(o => o.name).sort()).toEqual(['Alice', 'Bob'])
  })
})

describe('GET /api/owners/:name', () => {
  it('returns action items for a specific owner', async () => {
    const res = await request(app).get('/api/owners/Alice')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].owner).toBe('Alice')
  })

  it('returns empty array for unknown owner', async () => {
    const res = await request(app).get('/api/owners/Charlie')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)
  })
})
```

**Step 2: Run to verify failure**
```bash
npm test -- action-items.test owners.test
# Expected: FAIL — routes not registered
```

**Step 3: Implement action-items route**

`recap/server/routes/action-items.js`:
```js
import { Router } from 'express'

const VALID_STATUSES = ['open', 'in_progress', 'done']

export function actionItemsRouter(db) {
  const router = Router()

  router.patch('/:id', (req, res) => {
    const { status } = req.body
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` })
    }

    const item = db.prepare('SELECT * FROM action_items WHERE id = ?').get(req.params.id)
    if (!item) return res.status(404).json({ error: 'Not found' })

    db.prepare('UPDATE action_items SET status = ? WHERE id = ?').run(status, req.params.id)
    res.json({ ...item, status })
  })

  return router
}
```

**Step 4: Implement owners route**

`recap/server/routes/owners.js`:
```js
import { Router } from 'express'

export function ownersRouter(db) {
  const router = Router()

  router.get('/', (req, res) => {
    const owners = db.prepare(
      'SELECT DISTINCT owner AS name FROM action_items ORDER BY owner'
    ).all()
    res.json(owners)
  })

  router.get('/:name', (req, res) => {
    const items = db.prepare(
      'SELECT * FROM action_items WHERE owner = ? ORDER BY due_date ASC'
    ).all(req.params.name)
    res.json(items)
  })

  return router
}
```

**Step 5: Register routes in app.js**

`recap/server/app.js`:
```js
import express from 'express'
import { meetingsRouter } from './routes/meetings.js'
import { actionItemsRouter } from './routes/action-items.js'
import { ownersRouter } from './routes/owners.js'

export function createApp(db) {
  const app = express()
  app.use(express.json())

  app.get('/health', (req, res) => res.json({ status: 'ok' }))
  app.use('/api/meetings', meetingsRouter(db))
  app.use('/api/action-items', actionItemsRouter(db))
  app.use('/api/owners', ownersRouter(db))

  return app
}
```

**Step 6: Run tests to verify they pass**
```bash
npm test
# Expected: PASS (all tests)
```

**Step 7: Commit**
```bash
git add server/routes/action-items.js server/routes/owners.js server/__tests__/action-items.test.js server/__tests__/owners.test.js server/app.js
git commit -m "feat: add action item status updates and owner filter routes"
```

---

### Task 6: Claude extraction service

**Files:**
- Create: `recap/server/__tests__/extractor.test.js`
- Modify: `recap/server/services/extractor.js`

**Step 1: Write failing test**

`recap/server/__tests__/extractor.test.js`:
```js
import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify([
            { description: 'Write unit tests', owner: 'Alice', due_date: '2026-04-10' },
            { description: 'Deploy to production', owner: 'Bob', due_date: null }
          ])
        }]
      })
    }
  }))
}))

import { extractActionItems } from '../services/extractor.js'

describe('extractActionItems', () => {
  it('returns structured action items from meeting notes', async () => {
    const items = await extractActionItems('Alice will write tests by April 10. Bob will deploy.')

    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({
      description: 'Write unit tests',
      owner: 'Alice',
      due_date: '2026-04-10'
    })
    expect(items[1].due_date).toBeNull()
  })

  it('returns empty array if Claude returns empty list', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    Anthropic.mockImplementationOnce(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: '[]' }]
        })
      }
    }))

    const items = await extractActionItems('No action items here.')
    expect(items).toEqual([])
  })

  it('throws if Claude returns unparseable JSON', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    Anthropic.mockImplementationOnce(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Sorry, I cannot help with that.' }]
        })
      }
    }))

    await expect(extractActionItems('Some notes')).rejects.toThrow()
  })
})
```

**Step 2: Run to verify failure**
```bash
npm test -- extractor.test
# Expected: FAIL — extractor returns []
```

**Step 3: Implement extractor**

`recap/server/services/extractor.js`:
```js
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are an expert meeting notes analyzer.
Extract all action items from the meeting notes provided.
Return ONLY a valid JSON array with no extra text, markdown, or explanation.
Each item must have: description (string), owner (string), due_date (ISO date string or null).
Example: [{"description":"Write report","owner":"Alice","due_date":"2026-04-10"}]
If there are no action items, return [].`

export async function extractActionItems(rawNotes) {
  const client = new Anthropic()

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Extract all action items from these meeting notes:\n\n${rawNotes}`
    }],
    system: SYSTEM_PROMPT,
  })

  const text = message.content[0].text.trim()
  const items = JSON.parse(text)

  return items.map(item => ({
    description: item.description,
    owner: item.owner,
    due_date: item.due_date || null,
  }))
}
```

**Step 4: Run tests to verify they pass**
```bash
npm test -- extractor.test
# Expected: PASS (3 tests)
```

**Step 5: Run full test suite**
```bash
npm test
# Expected: all tests pass
```

**Step 6: Commit**
```bash
git add server/services/extractor.js server/__tests__/extractor.test.js
git commit -m "feat: implement Claude extraction service with prompt and JSON parsing"
```

---

### Task 7: React frontend scaffold

**Files:**
- Create: `recap/client/` (Vite React app)

**Step 1: Scaffold React app**
```bash
cd recap && npm create vite@latest client -- --template react
cd client && npm install
npm install -D tailwindcss @tailwindcss/vite
```

**Step 2: Configure Tailwind**

`recap/client/vite.config.js`:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  build: {
    outDir: '../server/public'
  }
})
```

`recap/client/src/index.css`:
```css
@import "tailwindcss";
```

**Step 3: Create minimal App with routing**

```bash
cd recap/client && npm install react-router-dom
```

`recap/client/src/App.jsx`:
```jsx
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import MeetingDetail from './pages/MeetingDetail'
import OwnerView from './pages/OwnerView'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b px-6 py-3 flex items-center gap-6">
          <Link to="/" className="font-semibold text-gray-900">Recap</Link>
          <Link to="/owners" className="text-sm text-gray-500 hover:text-gray-900">By Owner</Link>
        </nav>
        <main className="max-w-4xl mx-auto px-6 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/meetings/:id" element={<MeetingDetail />} />
            <Route path="/owners" element={<OwnerView />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
```

**Step 4: Create page stubs**

`recap/client/src/pages/Dashboard.jsx`:
```jsx
export default function Dashboard() {
  return <div>Dashboard — coming soon</div>
}
```

`recap/client/src/pages/MeetingDetail.jsx`:
```jsx
export default function MeetingDetail() {
  return <div>Meeting Detail — coming soon</div>
}
```

`recap/client/src/pages/OwnerView.jsx`:
```jsx
export default function OwnerView() {
  return <div>Owner View — coming soon</div>
}
```

**Step 5: Verify dev server starts**
```bash
cd recap/client && npm run dev
# Expected: Vite server at http://localhost:5173 with blank stub pages
# Ctrl+C
```

**Step 6: Commit**
```bash
cd recap
git add client/
git commit -m "feat: scaffold React frontend with Vite, Tailwind, and routing"
```

---

### Task 8: Dashboard page

**Files:**
- Modify: `recap/client/src/pages/Dashboard.jsx`

**Step 1: Implement Dashboard**

`recap/client/src/pages/Dashboard.jsx`:
```jsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMeetings, useSubmitMeeting } from '../hooks/useMeetings'

export default function Dashboard() {
  const { meetings, loading, refetch } = useMeetings()
  const { submit, submitting } = useSubmitMeeting(refetch)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!notes.trim()) return
    await submit({ title, raw_notes: notes })
    setTitle('')
    setNotes('')
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-semibold mb-4">New Meeting</h1>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Meeting title (optional)"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
          <textarea
            className="w-full border rounded px-3 py-2 text-sm h-32 resize-none"
            placeholder="Paste your meeting notes here..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={submitting}
            className="bg-gray-900 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            {submitting ? 'Extracting...' : 'Extract Action Items'}
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Recent Meetings</h2>
        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : meetings.length === 0 ? (
          <p className="text-sm text-gray-400">No meetings yet.</p>
        ) : (
          <ul className="space-y-2">
            {meetings.map(m => (
              <li key={m.id} className="bg-white border rounded px-4 py-3 flex justify-between items-center">
                <div>
                  <Link to={`/meetings/${m.id}`} className="font-medium text-gray-900 hover:underline">
                    {m.title}
                  </Link>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(m.created_at).toLocaleDateString()}</p>
                </div>
                <span className="text-sm text-gray-500">{m.open_count} open</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

**Step 2: Create hooks**

`recap/client/src/hooks/useMeetings.js`:
```js
import { useState, useEffect, useCallback } from 'react'

export function useMeetings() {
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const res = await fetch('/api/meetings')
    setMeetings(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { refetch() }, [refetch])

  return { meetings, loading, refetch }
}

export function useSubmitMeeting(onSuccess) {
  const [submitting, setSubmitting] = useState(false)

  async function submit(data) {
    setSubmitting(true)
    await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setSubmitting(false)
    await onSuccess()
  }

  return { submit, submitting }
}
```

**Step 3: Verify in browser**
```bash
cd recap && node server/index.js &
cd client && npm run dev
# Open http://localhost:5173, paste notes, submit
# Expected: meeting appears in list with open count
```

**Step 4: Commit**
```bash
cd recap
git add client/src/pages/Dashboard.jsx client/src/hooks/useMeetings.js
git commit -m "feat: implement Dashboard with meeting submission and list"
```

---

### Task 9: Meeting detail and owner view pages

**Files:**
- Modify: `recap/client/src/pages/MeetingDetail.jsx`
- Modify: `recap/client/src/pages/OwnerView.jsx`

**Step 1: Implement MeetingDetail**

`recap/client/src/pages/MeetingDetail.jsx`:
```jsx
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'

const STATUS_OPTIONS = ['open', 'in_progress', 'done']
const STATUS_LABELS = { open: 'Open', in_progress: 'In Progress', done: 'Done' }

export default function MeetingDetail() {
  const { id } = useParams()
  const [meeting, setMeeting] = useState(null)

  async function load() {
    const res = await fetch(`/api/meetings/${id}`)
    setMeeting(await res.json())
  }

  useEffect(() => { load() }, [id])

  async function updateStatus(itemId, status) {
    await fetch(`/api/action-items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await load()
  }

  if (!meeting) return <p className="text-sm text-gray-400">Loading...</p>

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-gray-400 hover:text-gray-700">← Back</Link>
        <h1 className="text-xl font-semibold mt-2">{meeting.title}</h1>
        <p className="text-xs text-gray-400">{new Date(meeting.created_at).toLocaleDateString()}</p>
      </div>

      <section>
        <h2 className="text-sm font-medium text-gray-500 mb-2">Raw Notes</h2>
        <pre className="bg-gray-50 border rounded p-4 text-sm whitespace-pre-wrap">{meeting.raw_notes}</pre>
      </section>

      <section>
        <h2 className="text-sm font-medium text-gray-500 mb-3">Action Items ({meeting.action_items.length})</h2>
        {meeting.action_items.length === 0 ? (
          <p className="text-sm text-gray-400">No action items extracted.</p>
        ) : (
          <ul className="space-y-2">
            {meeting.action_items.map(item => (
              <li key={item.id} className="bg-white border rounded px-4 py-3 flex justify-between items-start gap-4">
                <div>
                  <p className="text-sm font-medium">{item.description}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {item.owner}{item.due_date ? ` · due ${item.due_date}` : ''}
                  </p>
                </div>
                <select
                  value={item.status}
                  onChange={e => updateStatus(item.id, e.target.value)}
                  className="text-xs border rounded px-2 py-1"
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

**Step 2: Implement OwnerView**

`recap/client/src/pages/OwnerView.jsx`:
```jsx
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

export default function OwnerView() {
  const [owners, setOwners] = useState([])
  const [selected, setSelected] = useState(null)
  const [items, setItems] = useState([])

  useEffect(() => {
    fetch('/api/owners').then(r => r.json()).then(setOwners)
  }, [])

  async function selectOwner(name) {
    setSelected(name)
    const res = await fetch(`/api/owners/${encodeURIComponent(name)}`)
    setItems(await res.json())
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Action Items by Owner</h1>

      <div className="flex gap-2 flex-wrap">
        {owners.map(o => (
          <button
            key={o.name}
            onClick={() => selectOwner(o.name)}
            className={`px-3 py-1 rounded-full text-sm border ${selected === o.name ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700'}`}
          >
            {o.name}
          </button>
        ))}
      </div>

      {selected && (
        <div>
          <h2 className="text-sm font-medium text-gray-500 mb-3">{selected}'s Items</h2>
          {items.length === 0 ? (
            <p className="text-sm text-gray-400">No items found.</p>
          ) : (
            <ul className="space-y-2">
              {items.map(item => (
                <li key={item.id} className="bg-white border rounded px-4 py-3">
                  <p className="text-sm font-medium">{item.description}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    <span className={`capitalize ${item.status === 'done' ? 'text-green-600' : item.status === 'in_progress' ? 'text-yellow-600' : 'text-gray-400'}`}>
                      {item.status.replace('_', ' ')}
                    </span>
                    {item.due_date ? ` · due ${item.due_date}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
```

**Step 3: Commit**
```bash
git add client/src/pages/MeetingDetail.jsx client/src/pages/OwnerView.jsx
git commit -m "feat: implement meeting detail and owner view pages"
```

---

### Task 10: Wire frontend into Express and deploy config

**Files:**
- Modify: `recap/server/app.js`
- Create: `recap/Procfile` (or `recap/railway.json`)

**Step 1: Serve React build from Express**

Add to `recap/server/app.js` (after routes):
```js
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const clientBuild = join(__dirname, 'public')

// Serve React app for all non-API routes (after API routes)
if (existsSync(clientBuild)) {
  app.use(express.static(clientBuild))
  app.get('*', (req, res) => {
    res.sendFile(join(clientBuild, 'index.html'))
  })
}
```

Full updated `recap/server/app.js`:
```js
import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { meetingsRouter } from './routes/meetings.js'
import { actionItemsRouter } from './routes/action-items.js'
import { ownersRouter } from './routes/owners.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function createApp(db) {
  const app = express()
  app.use(express.json())

  app.get('/health', (req, res) => res.json({ status: 'ok' }))
  app.use('/api/meetings', meetingsRouter(db))
  app.use('/api/action-items', actionItemsRouter(db))
  app.use('/api/owners', ownersRouter(db))

  const clientBuild = join(__dirname, 'public')
  if (existsSync(clientBuild)) {
    app.use(express.static(clientBuild))
    app.get('*', (req, res) => res.sendFile(join(clientBuild, 'index.html')))
  }

  return app
}
```

**Step 2: Build client and verify**
```bash
cd recap && npm run build
node server/index.js
# Open http://localhost:3000 — should show React app
```

**Step 3: Create Railway deploy config**

`recap/railway.json`:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

`recap/.env.example` (update):
```
PORT=3000
ANTHROPIC_API_KEY=your-key-here
DATABASE_PATH=./recap.db
```

**Step 4: Run full test suite one final time**
```bash
npm test
# Expected: all tests pass
```

**Step 5: Commit**
```bash
git add server/app.js railway.json .env.example
git commit -m "feat: serve React build from Express, add Railway deploy config"
```

---

## Board Hygiene

After each task is complete, update the corresponding story on the agent board:
- `mcp__agent-board__move_story` to advance status
- `mcp__agent-board__add_comment` with a brief note on what was done
- `mcp__agent-board__complete_story` when the epic's stories are all done
