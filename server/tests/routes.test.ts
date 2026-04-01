import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { getDb, closeDb } from '../src/db/index.js'
import { seed } from '../src/db/seed.js'
import { createRouter } from '../src/routes/index.js'
import { Broadcast } from '../src/ws/index.js'

const noop: Broadcast = () => {}

function buildApp() {
  const db = getDb(':memory:')
  seed(db)
  const app = express()
  app.use(express.json())
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
  it('returns 8 seeded agents', async () => {
    const res = await request(buildApp()).get('/api/agents')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(8)
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
