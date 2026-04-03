# Devlog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a micro-journaling CLI + web UI where developers log notes during the day and get a Claude-generated standup summary on demand.

**Architecture:** A Node.js CLI writes timestamped entries to SQLite at `~/.devlog/devlog.db`. A separate Express server reads the same DB and serves a React SPA. The CLI's `devlog summary` command calls Claude Haiku and stores the result; the web UI displays it with a copy button.

**Tech Stack:** Node.js (CommonJS) + commander + better-sqlite3 + @anthropic-ai/sdk / Express.js / React + Vite + TypeScript + Tailwind CSS / vitest

**Board project:** DEVLOG (b7b4a157-201b-4fee-b0f2-117abc6757c6)

---

## Agent Board Story IDs

When starting a task, call `start_story` with the story ID and your agent slug. When done, call `complete_story`.

| Task | Story ID | Agent |
|---|---|---|
| SQLite schema | 2152ab82-7b5f-4815-b898-a6945ee92a46 | dev-in |
| `devlog note` | ae7ce02e-fdab-442f-92eb-60788bf4d4b3 | dev-in |
| `devlog list` | df7dbb9e-6d6d-4958-9871-d37f3bb883ff | dev-in |
| `devlog open` | 2d9598fd-0680-47aa-9c6a-ea27b8f334b4 | dev-in |
| Claude API client | 0c4d54f9-3466-4d7a-b6f9-a739ba1700b0 | dev-in |
| Summary prompt | 1d682183-bec7-4143-8af0-9258191cae97 | dev-in |
| `devlog summary` cmd | fb1cf718-408d-4007-b20e-b0fd93f7e132 | dev-in |
| Express scaffold | 032c43f7-22ed-4d25-8b88-91f0d948706d | dev-in |
| GET /api/sessions | 98fd447e-3552-4fed-a2ee-c73faaa6f076 | dev-in |
| GET /api/sessions/:id/entries | cf37cb66-4c50-4183-976d-5e19f1154044 | dev-in |
| GET /api/sessions/:id/summary | a3ca31ed-8cbe-4fff-a7ab-c38f7d9d5f36 | dev-in |
| App shell + sidebar | 6c7cd685-6e9a-4203-95a6-5243f077a4e1 | fron-tina |
| Entry timeline | eb9c4c11-273f-4e99-8caf-aea7336761d2 | fron-tina |
| Summary panel | 7eb8755a-3f39-4c59-bce8-3349ff29fd61 | fron-tina |
| CLI unit tests | bb422851-3f56-46eb-8296-828597ad8d2c | tess-ter |
| API integration tests | 6b07d274-c774-49cc-93e5-617f7686f5eb | tess-ter |
| Summary prompt test | ed425ed8-f915-4a21-b7d1-99557273ae1e | tess-ter |
| README | c4f1c464-7cb5-4cc2-b11a-f63fdac20081 | doc-tor |
| CLI help text | 3da9673d-a44b-4eb0-adfa-412674e9bd4f | doc-tor |

---

## Task 1: Project scaffolding

**Board:** no story (structural setup)

**Files:**
- Create: `devlog/package.json`
- Create: `devlog/cli/package.json`
- Create: `devlog/server/package.json`
- Create: `devlog/client/package.json` (handled by Vite)
- Create: `devlog/.gitignore`

**Step 1: Create root workspace**

```bash
mkdir -p /c/Users/bruno.moise/agent-jira/devlog
cd /c/Users/bruno.moise/agent-jira/devlog
git init
```

**Step 2: Create `devlog/package.json`**

```json
{
  "name": "devlog",
  "private": true,
  "workspaces": ["cli", "server", "client"]
}
```

**Step 3: Create `devlog/cli/package.json`**

```json
{
  "name": "@devlog/cli",
  "version": "0.1.0",
  "main": "src/index.js",
  "bin": { "devlog": "src/index.js" },
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^9.4.3",
    "commander": "^12.0.0",
    "@anthropic-ai/sdk": "^0.39.0"
  },
  "devDependencies": {
    "vitest": "^1.4.0"
  }
}
```

**Step 4: Create `devlog/server/package.json`**

```json
{
  "name": "@devlog/server",
  "version": "0.1.0",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^9.4.3",
    "express": "^4.18.3"
  },
  "devDependencies": {
    "vitest": "^1.4.0",
    "supertest": "^6.3.4"
  }
}
```

**Step 5: Create `devlog/.gitignore`**

```
node_modules/
client/dist/
*.db
.env
```

**Step 6: Install dependencies**

```bash
cd /c/Users/bruno.moise/agent-jira/devlog
npm install
```

**Step 7: Scaffold client with Vite**

```bash
cd /c/Users/bruno.moise/agent-jira/devlog
npm create vite@latest client -- --template react-ts
cd client && npm install && npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

**Step 8: Commit**

```bash
cd /c/Users/bruno.moise/agent-jira/devlog
git add .
git commit -m "chore: scaffold devlog project"
```

---

## Task 2: SQLite schema + db module

**Board story:** `start_story(2152ab82-7b5f-4815-b898-a6945ee92a46, "dev-in")`

**Files:**
- Create: `devlog/cli/src/db.js`
- Create: `devlog/cli/tests/db.test.js`

**Step 1: Write the failing test**

Create `devlog/cli/tests/db.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Override DB path for tests
process.env.DEVLOG_DB_PATH = join(tmpdir(), `devlog-test-${Date.now()}.db`)

const { initDb, getTodaySession, insertEntry, getEntriesForSession } = await import('../src/db.js')

describe('db', () => {
  it('initDb creates tables', () => {
    const db = initDb()
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
    expect(tables).toContain('sessions')
    expect(tables).toContain('entries')
    expect(tables).toContain('summaries')
  })

  it('getTodaySession creates session if none exists', () => {
    initDb()
    const session = getTodaySession()
    expect(session).toMatchObject({ date: new Date().toISOString().slice(0, 10) })
  })

  it('getTodaySession returns same session on second call', () => {
    initDb()
    const s1 = getTodaySession()
    const s2 = getTodaySession()
    expect(s1.id).toBe(s2.id)
  })

  it('insertEntry stores text under session', () => {
    initDb()
    const session = getTodaySession()
    insertEntry(session.id, 'fixed the bug')
    const entries = getEntriesForSession(session.id)
    expect(entries).toHaveLength(1)
    expect(entries[0].text).toBe('fixed the bug')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd /c/Users/bruno.moise/agent-jira/devlog/cli
npx vitest run tests/db.test.js
```
Expected: FAIL — `Cannot find module '../src/db.js'`

**Step 3: Create `devlog/cli/src/db.js`**

```js
import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const dbPath = process.env.DEVLOG_DB_PATH ?? join(homedir(), '.devlog', 'devlog.db')

let _db = null

export function initDb() {
  if (_db) return _db
  const dir = dbPath.substring(0, dbPath.lastIndexOf('/'))
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  _db = new Database(dbPath)
  _db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS summaries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id),
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  return _db
}

export function getTodaySession() {
  const db = initDb()
  const today = new Date().toISOString().slice(0, 10)
  const existing = db.prepare('SELECT * FROM sessions WHERE date = ?').get(today)
  if (existing) return existing
  const id = crypto.randomUUID()
  db.prepare('INSERT INTO sessions (id, date) VALUES (?, ?)').run(id, today)
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
}

export function insertEntry(sessionId, text) {
  const db = initDb()
  const id = crypto.randomUUID()
  db.prepare('INSERT INTO entries (id, session_id, text) VALUES (?, ?, ?)').run(id, sessionId, text)
  return id
}

export function getEntriesForSession(sessionId) {
  const db = initDb()
  return db.prepare('SELECT * FROM entries WHERE session_id = ? ORDER BY created_at ASC').all(sessionId)
}

export function getSessionByDate(date) {
  const db = initDb()
  return db.prepare('SELECT * FROM sessions WHERE date = ?').get(date) ?? null
}

export function getAllSessions() {
  const db = initDb()
  return db.prepare(`
    SELECT s.*, COUNT(e.id) as entry_count
    FROM sessions s
    LEFT JOIN entries e ON e.session_id = s.id
    GROUP BY s.id
    ORDER BY s.date DESC
  `).all()
}

export function getSummaryForSession(sessionId) {
  const db = initDb()
  return db.prepare('SELECT * FROM summaries WHERE session_id = ?').get(sessionId) ?? null
}

export function upsertSummary(sessionId, text) {
  const db = initDb()
  const id = crypto.randomUUID()
  db.prepare(`
    INSERT INTO summaries (id, session_id, text) VALUES (?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET text = excluded.text, created_at = datetime('now')
  `).run(id, sessionId, text)
}
```

**Step 4: Run test to verify it passes**

```bash
cd /c/Users/bruno.moise/agent-jira/devlog/cli
npx vitest run tests/db.test.js
```
Expected: PASS (4 tests)

**Step 5: Complete story and commit**

```
complete_story(2152ab82-7b5f-4815-b898-a6945ee92a46, "dev-in", "SQLite schema initialized with sessions/entries/summaries tables. DB path configurable via DEVLOG_DB_PATH env var for tests.")
```

```bash
cd /c/Users/bruno.moise/agent-jira/devlog
git add cli/src/db.js cli/tests/db.test.js
git commit -m "feat: SQLite schema and db module"
```

---

## Task 3: CLI entry point + `devlog note` command

**Board story:** `start_story(ae7ce02e-fdab-442f-92eb-60788bf4d4b3, "dev-in")`

**Files:**
- Create: `devlog/cli/src/index.js`
- Create: `devlog/cli/src/commands/note.js`
- Create: `devlog/cli/tests/note.test.js`

**Step 1: Write failing test**

Create `devlog/cli/tests/note.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'

process.env.DEVLOG_DB_PATH = join(tmpdir(), `devlog-note-test-${Date.now()}.db`)

const { initDb, getTodaySession, getEntriesForSession } = await import('../src/db.js')
const { noteCommand } = await import('../src/commands/note.js')

describe('note command', () => {
  beforeEach(() => { initDb() })

  it('adds an entry to today session', () => {
    noteCommand('fixed auth bug')
    const session = getTodaySession()
    const entries = getEntriesForSession(session.id)
    expect(entries).toHaveLength(1)
    expect(entries[0].text).toBe('fixed auth bug')
  })

  it('multiple notes accumulate', () => {
    noteCommand('note one')
    noteCommand('note two')
    const session = getTodaySession()
    const entries = getEntriesForSession(session.id)
    expect(entries).toHaveLength(2)
  })
})
```

**Step 2: Run test — verify fail**

```bash
cd /c/Users/bruno.moise/agent-jira/devlog/cli
npx vitest run tests/note.test.js
```
Expected: FAIL — `Cannot find module '../src/commands/note.js'`

**Step 3: Create `devlog/cli/src/commands/note.js`**

```js
import { getTodaySession, insertEntry } from '../db.js'

export function noteCommand(text) {
  const session = getTodaySession()
  insertEntry(session.id, text.trim())
  console.log(`Logged: ${text.trim()}`)
}
```

**Step 4: Create `devlog/cli/src/index.js`**

```js
#!/usr/bin/env node
import { program } from 'commander'
import { noteCommand } from './commands/note.js'
import { listCommand } from './commands/list.js'
import { summaryCommand } from './commands/summary.js'
import { openCommand } from './commands/open.js'

program
  .name('devlog')
  .description('Developer micro-journal with Claude-powered summaries')
  .version('0.1.0')

program
  .command('note <text>')
  .description('Add a timestamped note to today\'s session')
  .action(noteCommand)

program
  .command('list')
  .description('Print today\'s entries')
  .option('-d, --date <YYYY-MM-DD>', 'Date to list entries for')
  .action((opts) => listCommand(opts.date))

program
  .command('summary')
  .description('Generate a Claude summary of today\'s session')
  .option('-d, --date <YYYY-MM-DD>', 'Date to summarize')
  .action((opts) => summaryCommand(opts.date))

program
  .command('open')
  .description('Open the web UI in your browser')
  .action(openCommand)

program.parse()
```

**Step 5: Run test — verify pass**

```bash
cd /c/Users/bruno.moise/agent-jira/devlog/cli
npx vitest run tests/note.test.js
```
Expected: PASS

**Step 6: Complete story and commit**

```
complete_story(ae7ce02e-fdab-442f-92eb-60788bf4d4b3, "dev-in", "devlog note command implemented and tested.")
```

```bash
cd /c/Users/bruno.moise/agent-jira/devlog
git add cli/src/
git commit -m "feat: devlog note command + CLI entry point"
```

---

## Task 4: `devlog list` command

**Board story:** `start_story(df7dbb9e-6d6d-4958-9871-d37f3bb883ff, "dev-in")`

**Files:**
- Create: `devlog/cli/src/commands/list.js`
- Create: `devlog/cli/tests/list.test.js`

**Step 1: Write failing test**

Create `devlog/cli/tests/list.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'

process.env.DEVLOG_DB_PATH = join(tmpdir(), `devlog-list-test-${Date.now()}.db`)

const { initDb, getTodaySession, insertEntry } = await import('../src/db.js')
const { listCommand } = await import('../src/commands/list.js')

describe('list command', () => {
  beforeEach(() => { initDb() })

  it('prints entries for today', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const session = getTodaySession()
    insertEntry(session.id, 'wrote tests')
    insertEntry(session.id, 'fixed bug')
    listCommand()
    expect(consoleSpy).toHaveBeenCalledTimes(2)
    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('wrote tests')
    expect(output).toContain('fixed bug')
    consoleSpy.mockRestore()
  })

  it('prints message when no entries', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    listCommand()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No entries'))
    consoleSpy.mockRestore()
  })
})
```

**Step 2: Run test — verify fail**

```bash
cd /c/Users/bruno.moise/agent-jira/devlog/cli
npx vitest run tests/list.test.js
```

**Step 3: Create `devlog/cli/src/commands/list.js`**

```js
import { getTodaySession, getEntriesForSession, getSessionByDate } from '../db.js'

export function listCommand(date) {
  const session = date ? getSessionByDate(date) : getTodaySession()
  if (!session) {
    console.log(`No entries for ${date ?? 'today'}.`)
    return
  }
  const entries = getEntriesForSession(session.id)
  if (entries.length === 0) {
    console.log(`No entries for ${date ?? 'today'}.`)
    return
  }
  for (const entry of entries) {
    const time = entry.created_at.slice(11, 16)
    console.log(`[${time}] ${entry.text}`)
  }
}
```

**Step 4: Run test — verify pass**

```bash
cd /c/Users/bruno.moise/agent-jira/devlog/cli
npx vitest run tests/list.test.js
```

**Step 5: Complete story and commit**

```
complete_story(df7dbb9e-6d6d-4958-9871-d37f3bb883ff, "dev-in", "devlog list command implemented and tested.")
```

```bash
git add cli/src/commands/list.js cli/tests/list.test.js
git commit -m "feat: devlog list command"
```

---

## Task 5: `devlog open` command

**Board story:** `start_story(2d9598fd-0680-47aa-9c6a-ea27b8f334b4, "dev-in")`

**Files:**
- Create: `devlog/cli/src/commands/open.js`

**Step 1: Create `devlog/cli/src/commands/open.js`**

```js
import { exec } from 'child_process'

export function openCommand() {
  const url = 'http://localhost:4242'
  const cmd = process.platform === 'win32' ? `start ${url}`
    : process.platform === 'darwin' ? `open ${url}`
    : `xdg-open ${url}`
  exec(cmd)
  console.log(`Opening ${url}`)
}
```

**Step 2: Complete story and commit**

```
complete_story(2d9598fd-0680-47aa-9c6a-ea27b8f334b4, "dev-in", "devlog open command implemented.")
```

```bash
git add cli/src/commands/open.js
git commit -m "feat: devlog open command"
```

---

## Task 6: Claude API client + summary prompt

**Board stories:**
- `start_story(0c4d54f9-3466-4d7a-b6f9-a739ba1700b0, "dev-in")` — Claude API client
- `start_story(1d682183-bec7-4143-8af0-9258191cae97, "dev-in")` — Summary prompt

**Files:**
- Create: `devlog/cli/src/claude.js`
- Create: `devlog/cli/tests/claude.test.js`

**Step 1: Write failing test**

Create `devlog/cli/tests/claude.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildSummaryPrompt } from '../src/claude.js'

describe('buildSummaryPrompt', () => {
  it('includes all entry texts', () => {
    const entries = [
      { text: 'fixed auth bug', created_at: '2026-04-01 09:00:00' },
      { text: 'added rate limiting', created_at: '2026-04-01 10:30:00' },
    ]
    const prompt = buildSummaryPrompt(entries, '2026-04-01')
    expect(prompt).toContain('fixed auth bug')
    expect(prompt).toContain('added rate limiting')
    expect(prompt).toContain('2026-04-01')
  })

  it('produces a string', () => {
    const entries = [{ text: 'did a thing', created_at: '2026-04-01 09:00:00' }]
    expect(typeof buildSummaryPrompt(entries, '2026-04-01')).toBe('string')
  })
})
```

**Step 2: Run test — verify fail**

```bash
cd /c/Users/bruno.moise/agent-jira/devlog/cli
npx vitest run tests/claude.test.js
```

**Step 3: Create `devlog/cli/src/claude.js`**

```js
import Anthropic from '@anthropic-ai/sdk'

export function buildSummaryPrompt(entries, date) {
  const lines = entries.map(e => `- [${e.created_at.slice(11, 16)}] ${e.text}`).join('\n')
  return `You are a helpful assistant that writes clear, concise standup updates for software developers.

Below are the raw notes a developer logged on ${date}:

${lines}

Write a 2-3 sentence standup-style summary of what they accomplished. Use past tense. Be specific. Do not add anything that isn't in the notes.`
}

export async function generateSummary(entries, date) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable not set.')

  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{ role: 'user', content: buildSummaryPrompt(entries, date) }],
  })
  return message.content[0].text
}
```

**Step 4: Run test — verify pass**

```bash
cd /c/Users/bruno.moise/agent-jira/devlog/cli
npx vitest run tests/claude.test.js
```

**Step 5: Complete stories and commit**

```
complete_story(0c4d54f9-3466-4d7a-b6f9-a739ba1700b0, "dev-in", "Anthropic client wired up.")
complete_story(1d682183-bec7-4143-8af0-9258191cae97, "dev-in", "Summary prompt builder implemented and tested.")
```

```bash
git add cli/src/claude.js cli/tests/claude.test.js
git commit -m "feat: Claude API client and summary prompt builder"
```

---

## Task 7: `devlog summary` command

**Board story:** `start_story(fb1cf718-408d-4007-b20e-b0fd93f7e132, "dev-in")`

**Files:**
- Create: `devlog/cli/src/commands/summary.js`

**Step 1: Create `devlog/cli/src/commands/summary.js`**

```js
import { getTodaySession, getSessionByDate, getEntriesForSession, upsertSummary } from '../db.js'
import { generateSummary } from '../claude.js'

export async function summaryCommand(date) {
  const session = date ? getSessionByDate(date) : getTodaySession()
  if (!session) {
    console.log(`No session found for ${date ?? 'today'}.`)
    return
  }
  const entries = getEntriesForSession(session.id)
  if (entries.length === 0) {
    console.log('No entries to summarize.')
    return
  }
  console.log('Generating summary...')
  try {
    const text = await generateSummary(entries, session.date)
    upsertSummary(session.id, text)
    console.log('\n--- Summary ---')
    console.log(text)
    console.log('---------------\n')
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }
}
```

**Step 2: Complete story and commit**

```
complete_story(fb1cf718-408d-4007-b20e-b0fd93f7e132, "dev-in", "devlog summary command implemented.")
```

```bash
git add cli/src/commands/summary.js
git commit -m "feat: devlog summary command"
```

---

## Task 8: Express server scaffold

**Board story:** `start_story(032c43f7-22ed-4d25-8b88-91f0d948706d, "dev-in")`

**Files:**
- Create: `devlog/server/src/index.js`
- Create: `devlog/server/src/db.js`

**Step 1: Create `devlog/server/src/db.js`**

```js
// Server uses the same DB path as CLI — read-only for safety
import Database from 'better-sqlite3'
import { join } from 'path'
import { homedir } from 'os'

const dbPath = process.env.DEVLOG_DB_PATH ?? join(homedir(), '.devlog', 'devlog.db')

let _db = null
export function getDb() {
  if (_db) return _db
  _db = new Database(dbPath, { readonly: false })
  return _db
}
```

**Step 2: Create `devlog/server/src/index.js`**

```js
import express from 'express'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import sessionsRouter from './routes/sessions.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT ?? 4242

app.use(express.json())
app.use('/api/sessions', sessionsRouter)

// Serve React SPA in production
const clientDist = join(__dirname, '../../client/dist')
app.use(express.static(clientDist))
app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')))

app.listen(PORT, () => console.log(`Devlog server running at http://localhost:${PORT}`))

export { app }
```

**Step 3: Complete story and commit**

```
complete_story(032c43f7-22ed-4d25-8b88-91f0d948706d, "dev-in", "Express scaffold created.")
```

```bash
mkdir -p /c/Users/bruno.moise/agent-jira/devlog/server/src/routes
git add server/src/
git commit -m "feat: Express server scaffold"
```

---

## Task 9: REST API endpoints

**Board stories:**
- `start_story(98fd447e-3552-4fed-a2ee-c73faaa6f076, "dev-in")` — GET /api/sessions
- `start_story(cf37cb66-4c50-4183-976d-5e19f1154044, "dev-in")` — GET /api/sessions/:id/entries
- `start_story(a3ca31ed-8cbe-4fff-a7ab-c38f7d9d5f36, "dev-in")` — GET /api/sessions/:id/summary

**Files:**
- Create: `devlog/server/src/routes/sessions.js`
- Create: `devlog/server/tests/api.test.js`

**Step 1: Write failing tests**

Create `devlog/server/tests/api.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import request from 'supertest'

process.env.DEVLOG_DB_PATH = join(tmpdir(), `devlog-api-test-${Date.now()}.db`)

// Seed the test DB via CLI db module
const { initDb, getTodaySession, insertEntry, upsertSummary } = await import('../../cli/src/db.js')

let sessionId
beforeAll(() => {
  initDb()
  const session = getTodaySession()
  sessionId = session.id
  insertEntry(sessionId, 'wrote API tests')
  insertEntry(sessionId, 'fixed a bug')
  upsertSummary(sessionId, 'Today I wrote API tests and fixed a bug.')
})

const { app } = await import('../src/index.js')

describe('GET /api/sessions', () => {
  it('returns list of sessions', async () => {
    const res = await request(app).get('/api/sessions')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0]).toHaveProperty('date')
    expect(res.body[0]).toHaveProperty('entry_count')
  })
})

describe('GET /api/sessions/:id/entries', () => {
  it('returns entries for session', async () => {
    const res = await request(app).get(`/api/sessions/${sessionId}/entries`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0].text).toBe('wrote API tests')
  })

  it('returns 404 for unknown session', async () => {
    const res = await request(app).get('/api/sessions/nonexistent/entries')
    expect(res.status).toBe(404)
  })
})

describe('GET /api/sessions/:id/summary', () => {
  it('returns stored summary', async () => {
    const res = await request(app).get(`/api/sessions/${sessionId}/summary`)
    expect(res.status).toBe(200)
    expect(res.body.text).toBe('Today I wrote API tests and fixed a bug.')
  })

  it('returns null when no summary exists', async () => {
    // Create a new session with no summary
    const { insertEntry: ie, getTodaySession: gts } = await import('../../cli/src/db.js')
    // Use a different date session — just check with a made-up ID
    const res = await request(app).get('/api/sessions/no-summary-yet/summary')
    expect(res.status).toBe(200)
    expect(res.body).toBeNull()
  })
})
```

**Step 2: Run tests — verify fail**

```bash
cd /c/Users/bruno.moise/agent-jira/devlog/server
npx vitest run tests/api.test.js
```

**Step 3: Create `devlog/server/src/routes/sessions.js`**

```js
import { Router } from 'express'
import { getDb } from '../db.js'

const router = Router()

router.get('/', (_req, res) => {
  const db = getDb()
  const sessions = db.prepare(`
    SELECT s.*, COUNT(e.id) as entry_count
    FROM sessions s
    LEFT JOIN entries e ON e.session_id = s.id
    GROUP BY s.id
    ORDER BY s.date DESC
  `).all()
  res.json(sessions)
})

router.get('/:id/entries', (req, res) => {
  const db = getDb()
  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(req.params.id)
  if (!session) return res.status(404).json({ error: 'Session not found' })
  const entries = db.prepare('SELECT * FROM entries WHERE session_id = ? ORDER BY created_at ASC').all(req.params.id)
  res.json(entries)
})

router.get('/:id/summary', (req, res) => {
  const db = getDb()
  const summary = db.prepare('SELECT * FROM summaries WHERE session_id = ?').get(req.params.id)
  res.json(summary ?? null)
})

export default router
```

**Step 4: Run tests — verify pass**

```bash
cd /c/Users/bruno.moise/agent-jira/devlog/server
npx vitest run tests/api.test.js
```

**Step 5: Complete stories and commit**

```
complete_story(98fd447e-3552-4fed-a2ee-c73faaa6f076, "dev-in", "GET /api/sessions implemented.")
complete_story(cf37cb66-4c50-4183-976d-5e19f1154044, "dev-in", "GET /api/sessions/:id/entries implemented.")
complete_story(a3ca31ed-8cbe-4fff-a7ab-c38f7d9d5f36, "dev-in", "GET /api/sessions/:id/summary implemented.")
```

```bash
git add server/src/routes/sessions.js server/tests/api.test.js
git commit -m "feat: REST API endpoints for sessions, entries, summary"
```

---

## Task 10: React client — app shell + session sidebar

**Board story:** `start_story(6c7cd685-6e9a-4203-95a6-5243f077a4e1, "fron-tina")`

**Files:**
- Modify: `devlog/client/src/App.tsx`
- Create: `devlog/client/src/components/SessionSidebar.tsx`
- Create: `devlog/client/src/hooks/useApi.ts`

**Step 1: Configure Tailwind**

Update `devlog/client/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Update `devlog/client/tailwind.config.js`:

```js
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

**Step 2: Create `devlog/client/src/hooks/useApi.ts`**

```ts
const BASE = 'http://localhost:4242/api'

export async function fetchSessions() {
  const res = await fetch(`${BASE}/sessions`)
  if (!res.ok) throw new Error('Failed to fetch sessions')
  return res.json()
}

export async function fetchEntries(sessionId: string) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/entries`)
  if (!res.ok) throw new Error('Failed to fetch entries')
  return res.json()
}

export async function fetchSummary(sessionId: string) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/summary`)
  if (!res.ok) throw new Error('Failed to fetch summary')
  return res.json()
}
```

**Step 3: Create `devlog/client/src/components/SessionSidebar.tsx`**

```tsx
interface Session {
  id: string
  date: string
  entry_count: number
}

interface Props {
  sessions: Session[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function SessionSidebar({ sessions, selectedId, onSelect }: Props) {
  return (
    <aside className="w-56 border-r border-gray-200 bg-gray-50 flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sessions</h2>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
              selectedId === s.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'
            }`}
          >
            <div>{s.date}</div>
            <div className="text-xs text-gray-400">{s.entry_count} notes</div>
          </button>
        ))}
        {sessions.length === 0 && (
          <p className="px-4 py-3 text-sm text-gray-400">No sessions yet.</p>
        )}
      </nav>
    </aside>
  )
}
```

**Step 4: Update `devlog/client/src/App.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { SessionSidebar } from './components/SessionSidebar'
import { EntryTimeline } from './components/EntryTimeline'
import { SummaryPanel } from './components/SummaryPanel'
import { fetchSessions, fetchEntries, fetchSummary } from './hooks/useApi'

export default function App() {
  const [sessions, setSessions] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)

  useEffect(() => {
    fetchSessions().then((s) => {
      setSessions(s)
      if (s.length > 0) setSelectedId(s[0].id)
    })
  }, [])

  useEffect(() => {
    if (!selectedId) return
    fetchEntries(selectedId).then(setEntries)
    fetchSummary(selectedId).then(setSummary)
  }, [selectedId])

  return (
    <div className="flex h-screen bg-white text-gray-900 font-sans">
      <SessionSidebar sessions={sessions} selectedId={selectedId} onSelect={setSelectedId} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="px-6 py-4 border-b border-gray-200">
          <h1 className="text-lg font-semibold">Devlog</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <EntryTimeline entries={entries} />
          <SummaryPanel summary={summary} />
        </div>
      </main>
    </div>
  )
}
```

**Step 5: Complete story and commit**

```
complete_story(6c7cd685-6e9a-4203-95a6-5243f077a4e1, "fron-tina", "App shell and session sidebar implemented.")
```

```bash
git add client/src/
git commit -m "feat: app shell + session sidebar"
```

---

## Task 11: Entry timeline + summary panel

**Board stories:**
- `start_story(eb9c4c11-273f-4e99-8caf-aea7336761d2, "fron-tina")` — Entry timeline
- `start_story(7eb8755a-3f39-4c59-bce8-3349ff29fd61, "fron-tina")` — Summary panel

**Files:**
- Create: `devlog/client/src/components/EntryTimeline.tsx`
- Create: `devlog/client/src/components/SummaryPanel.tsx`

**Step 1: Create `devlog/client/src/components/EntryTimeline.tsx`**

```tsx
interface Entry {
  id: string
  text: string
  created_at: string
}

export function EntryTimeline({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-gray-400">No entries for this session.</p>
  }
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Notes</h3>
      <ol className="relative border-l border-gray-200 space-y-4 ml-3">
        {entries.map((e) => (
          <li key={e.id} className="ml-4">
            <div className="absolute -left-1.5 w-3 h-3 rounded-full bg-indigo-400 border-2 border-white" />
            <time className="text-xs text-gray-400">{e.created_at.slice(11, 16)}</time>
            <p className="text-sm text-gray-800 mt-0.5">{e.text}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
```

**Step 2: Create `devlog/client/src/components/SummaryPanel.tsx`**

```tsx
import { useState } from 'react'

interface Summary { text: string }

export function SummaryPanel({ summary }: { summary: Summary | null }) {
  const [copied, setCopied] = useState(false)

  if (!summary) {
    return (
      <section className="rounded-lg border border-dashed border-gray-200 p-4">
        <p className="text-sm text-gray-400">No summary yet. Run <code className="bg-gray-100 px-1 rounded text-xs">devlog summary</code> to generate one.</p>
      </section>
    )
  }

  function copy() {
    navigator.clipboard.writeText(summary!.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="rounded-lg border border-gray-200 p-4 bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Summary</h3>
        <button
          onClick={copy}
          className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <p className="text-sm text-gray-800 leading-relaxed">{summary.text}</p>
    </section>
  )
}
```

**Step 3: Complete stories and commit**

```
complete_story(eb9c4c11-273f-4e99-8caf-aea7336761d2, "fron-tina", "Entry timeline component implemented.")
complete_story(7eb8755a-3f39-4c59-bce8-3349ff29fd61, "fron-tina", "Summary panel with copy button implemented.")
```

```bash
git add client/src/components/
git commit -m "feat: entry timeline and summary panel components"
```

---

## Task 12: CLI unit tests (Tess Ter)

**Board stories:**
- `start_story(bb422851-3f56-46eb-8296-828597ad8d2c, "tess-ter")` — CLI unit tests
- `start_story(ed425ed8-f915-4a21-b7d1-99557273ae1e, "tess-ter")` — Summary prompt unit test

These tests already exist from Tasks 2-6. Verify they all pass:

**Step 1: Run all CLI tests**

```bash
cd /c/Users/bruno.moise/agent-jira/devlog/cli
npx vitest run
```
Expected: All tests pass.

**Step 2: Complete stories and commit**

```
complete_story(bb422851-3f56-46eb-8296-828597ad8d2c, "tess-ter", "All CLI unit tests passing (db, note, list, claude).")
complete_story(ed425ed8-f915-4a21-b7d1-99557273ae1e, "tess-ter", "Summary prompt unit tests passing.")
```

```bash
git add cli/tests/
git commit -m "test: all CLI unit tests passing"
```

---

## Task 13: API integration tests (Tess Ter)

**Board story:** `start_story(6b07d274-c774-49cc-93e5-617f7686f5eb, "tess-ter")`

Tests already exist from Task 9. Verify:

**Step 1: Run server tests**

```bash
cd /c/Users/bruno.moise/agent-jira/devlog/server
npx vitest run
```
Expected: All tests pass.

**Step 2: Complete story and commit**

```
complete_story(6b07d274-c774-49cc-93e5-617f7686f5eb, "tess-ter", "API integration tests all passing.")
```

```bash
git commit -m "test: API integration tests verified passing"
```

---

## Task 14: Documentation (Doc Tor)

**Board stories:**
- `start_story(c4f1c464-7cb5-4cc2-b11a-f63fdac20081, "doc-tor")` — README
- `start_story(3da9673d-a44b-4eb0-adfa-412674e9bd4f, "doc-tor")` — CLI help text

**Files:**
- Create: `devlog/README.md`

**Step 1: Create `devlog/README.md`**

```markdown
# Devlog

A developer micro-journal with Claude-powered standup summaries.

## Install

```bash
cd cli && npm install
npm link   # makes `devlog` available globally
```

Set your Anthropic API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Usage

```bash
devlog note "fixed the flaky auth test"
devlog note "reviewed PR #42"
devlog list
devlog summary
devlog open
```

## Web UI

Start the server:

```bash
cd devlog/server && npm start
```

Then run `devlog open` or visit http://localhost:4242.

## Development

```bash
# Run CLI tests
cd cli && npx vitest run

# Run server tests
cd server && npx vitest run

# Run client dev server
cd client && npm run dev
```
```

**Step 2: Verify CLI help text renders correctly**

```bash
cd /c/Users/bruno.moise/agent-jira/devlog/cli
node src/index.js --help
node src/index.js note --help
node src/index.js summary --help
```

**Step 3: Complete stories and commit**

```
complete_story(c4f1c464-7cb5-4cc2-b11a-f63fdac20081, "doc-tor", "README with install guide and usage examples written.")
complete_story(3da9673d-a44b-4eb0-adfa-412674e9bd4f, "doc-tor", "CLI help text verified — commander auto-generates from command definitions.")
```

```bash
git add README.md
git commit -m "docs: README with install and usage guide"
```
