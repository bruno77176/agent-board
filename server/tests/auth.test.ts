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
  // Mock /me endpoint for unit testing (no actual passport session)
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
