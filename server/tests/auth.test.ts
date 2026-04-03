import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import session from 'express-session'
import passport from 'passport'
import { getDb, closeDb } from '../src/db/index.js'
import { seed } from '../src/db/seed.js'
import { authRouter } from '../src/routes/auth.js'
import { createRouter } from '../src/routes/index.js'
import { requireAuth } from '../src/middleware/auth.js'

function buildApp() {
  const db = getDb(':memory:')
  seed(db)
  const app = express()
  app.use(express.json())
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
  }))
  app.use(passport.initialize())
  app.use(passport.session())
  passport.serializeUser((user: any, done) => done(null, user.id))
  passport.deserializeUser((id: unknown, done) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id as number)
    done(null, user ?? false)
  })
  app.use('/api/auth', authRouter())
  return app
}

describe('GET /api/auth/me', () => {
  beforeEach(() => closeDb())

  it('returns 401 when not authenticated', async () => {
    const res = await request(buildApp()).get('/api/auth/me')
    expect(res.status).toBe(401)
  })
})

function buildProtectedApp() {
  const db = getDb(':memory:')
  seed(db)
  const app = express()
  app.use(express.json())
  app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }))
  app.use(passport.initialize())
  app.use(passport.session())
  passport.serializeUser((user: any, done) => done(null, user.id))
  passport.deserializeUser((id: unknown, done) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id as number)
    done(null, user ?? false)
  })
  app.use('/api', requireAuth, createRouter(db, () => {}))
  return app
}

describe('requireAuth middleware', () => {
  beforeEach(() => closeDb())

  it('returns 401 on protected route when not logged in', async () => {
    const res = await request(buildProtectedApp()).get('/api/projects')
    expect(res.status).toBe(401)
  })
})
