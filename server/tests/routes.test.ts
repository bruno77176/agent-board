import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { getDb, closeDb } from '../src/db/index.js'
import { seed } from '../src/db/seed.js'
import { createRouter } from '../src/routes/index.js'
import { Broadcast } from '../src/ws/index.js'

const noop: Broadcast = () => {}

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
  app.use((req: any, _res: any, next: any) => {
    req.user = user
    req.isAuthenticated = () => true
    next()
  })
  app.use('/api', createRouter(db, noop))
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
    const res = await request(buildApp()).post('/api/projects').send({ key: 'TEST', name: 'Test Project', workflow_id: 'standard' })
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

describe('GET /api/agents', () => {
  beforeEach(() => closeDb())
  it('returns seeded agents', async () => {
    const res = await request(buildApp()).get('/api/agents')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(10)
  })
})

describe('GET /api/workflows', () => {
  beforeEach(() => closeDb())
  it('returns workflows with parsed states array', async () => {
    const res = await request(buildApp()).get('/api/workflows')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(3)
    expect(Array.isArray(res.body[0].states)).toBe(true)
  })
})

describe('stories', () => {
  beforeEach(() => closeDb())

  async function setup() {
    const app = buildApp()
    const project = (await request(app).post('/api/projects').send({ key: 'TST', name: 'Test', workflow_id: 'standard' })).body
    const epic = (await request(app).post('/api/epics').send({ project_id: project.id, title: 'Epic 1', version: 'v0.0.1' })).body
    const feature = (await request(app).post('/api/features').send({ epic_id: epic.id, title: 'Feature 1' })).body
    return { app, project, epic, feature }
  }

  it('creates a story with status backlog', async () => {
    const { app, feature } = await setup()
    const res = await request(app).post('/api/stories').send({ feature_id: feature.id, title: 'Build login form', estimated_minutes: 5 })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('backlog')
  })

  it('moves story status and records event', async () => {
    const { app, feature } = await setup()
    const story = (await request(app).post('/api/stories').send({ feature_id: feature.id, title: 'S1', estimated_minutes: 3 })).body
    const res = await request(app).patch(`/api/stories/${story.id}/status`).send({ status: 'in_progress' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('in_progress')
    // event was recorded
    const events = (await request(app).get(`/api/events?target_id=${story.id}`)).body
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].to_status).toBe('in_progress')
  })

  it('adds a comment on an epic', async () => {
    const { app, epic } = await setup()
    const res = await request(app).post('/api/events').send({
      target_type: 'epic',
      target_id: epic.id,
      comment: 'Starting this epic now'
    })
    expect(res.status).toBe(201)
    expect(res.body.target_type).toBe('epic')
  })
})

describe('PATCH /api/epics/:id', () => {
  beforeEach(() => closeDb())
  it('updates epic start_date and end_date', async () => {
    const app = buildApp()
    const proj = await request(app).post('/api/projects').send({ key: 'RMP', name: 'Roadmap', workflow_id: 'standard' })
    const epic = await request(app).post('/api/epics').send({ project_id: proj.body.id, title: 'Epic 1' })
    const res = await request(app)
      .patch(`/api/epics/${epic.body.id}`)
      .send({ start_date: '2026-04-01', end_date: '2026-04-30' })
    expect(res.status).toBe(200)
    expect(res.body.start_date).toBe('2026-04-01')
    expect(res.body.end_date).toBe('2026-04-30')
  })
})

let keyCounter = 0
async function createStory(app: any, title = 'Test Story') {
  const key = `L${++keyCounter}`
  const proj = await request(app).post('/api/projects').send({ key, name: 'Link Test', workflow_id: 'standard' })
  const epic = await request(app).post('/api/epics').send({ project_id: proj.body.id, title: 'E1' })
  const feat = await request(app).post('/api/features').send({ epic_id: epic.body.id, title: 'F1' })
  const story = await request(app).post('/api/stories').send({ feature_id: feat.body.id, title })
  return { proj: proj.body, epic: epic.body, feat: feat.body, story: story.body }
}

describe('Story links', () => {
  beforeEach(() => closeDb())

  it('creates a link between two stories', async () => {
    const app = buildApp()
    const { story: a } = await createStory(app, 'Story A')
    const { story: b } = await createStory(app, 'Story B')
    const res = await request(app)
      .post(`/api/stories/${a.id}/links`)
      .send({ to_story_id: b.id, link_type: 'blocks' })
    expect(res.status).toBe(201)
    expect(res.body.link_type).toBe('blocks')
    expect(res.body.from_story_id).toBe(a.id)
    expect(res.body.to_story_id).toBe(b.id)
  })

  it('returns links for a story including inverse direction', async () => {
    const app = buildApp()
    const { story: a } = await createStory(app, 'A')
    const { story: b } = await createStory(app, 'B')
    await request(app).post(`/api/stories/${a.id}/links`).send({ to_story_id: b.id, link_type: 'blocks' })
    const res = await request(app).get(`/api/stories/${b.id}/links`)
    expect(res.status).toBe(200)
    expect(res.body.some((l: any) => l.link_type === 'blocks' && l.from_story_id === a.id)).toBe(true)
  })

  it('deletes a link', async () => {
    const app = buildApp()
    const { story: a } = await createStory(app, 'A')
    const { story: b } = await createStory(app, 'B')
    const create = await request(app).post(`/api/stories/${a.id}/links`).send({ to_story_id: b.id, link_type: 'relates_to' })
    const linkId = create.body.id
    const del = await request(app).delete(`/api/stories/${a.id}/links/${linkId}`)
    expect(del.status).toBe(204)
    const list = await request(app).get(`/api/stories/${a.id}/links`)
    expect(list.body).toHaveLength(0)
  })

  it('includes links in GET /api/stories/:id', async () => {
    const app = buildApp()
    const { story: a } = await createStory(app, 'A')
    const { story: b } = await createStory(app, 'B')
    await request(app).post(`/api/stories/${a.id}/links`).send({ to_story_id: b.id, link_type: 'blocks' })
    const res = await request(app).get(`/api/stories/${a.id}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.links)).toBe(true)
    expect(res.body.links.length).toBeGreaterThan(0)
  })
})

describe('GET /api/docs', () => {
  let tmpDir: string

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-test-'))
    fs.writeFileSync(path.join(tmpDir, 'test.md'), '# Hello')
    process.env.DOCS_PATH = tmpDir
  })

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true })
    delete process.env.DOCS_PATH
  })

  beforeEach(() => closeDb())

  it('lists .md files', async () => {
    const app = buildApp()
    const res = await request(app).get('/api/docs')
    expect(res.status).toBe(200)
    expect(res.body).toContain('test.md')
  })

  it('serves a valid .md file', async () => {
    const app = buildApp()
    const res = await request(app).get('/api/docs/test.md')
    expect(res.status).toBe(200)
    expect(res.text).toContain('# Hello')
  })

  it('rejects path traversal attempts with 403', async () => {
    const app = buildApp()
    // Use %2f encoding so Express doesn't normalize the path before it reaches the handler
    const res = await request(app).get('/api/docs/..%2fpackage.json')
    expect(res.status).toBe(403)
  })

  it('rejects non-.md files with 403', async () => {
    fs.writeFileSync(path.join(tmpDir, 'secret.json'), '{"key":"value"}')
    const app = buildApp()
    const res = await request(app).get('/api/docs/secret.json')
    expect(res.status).toBe(403)
  })
})
