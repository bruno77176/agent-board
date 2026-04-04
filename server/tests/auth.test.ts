import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import session from 'express-session'
import passport from 'passport'
import type postgres from 'postgres'
import { createSeededTestSql, closeTestSql, skipIfNoDb } from './helpers.js'
import { authRouter } from '../src/routes/auth.js'
import { createRouter } from '../src/routes/index.js'
import { requireAuth } from '../src/middleware/auth.js'

function buildApp(sql: postgres.Sql) {
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
  passport.deserializeUser(async (id: unknown, done) => {
    try {
      const [user] = await sql`SELECT * FROM users WHERE id = ${id as number}`
      done(null, user ?? false)
    } catch (err) {
      done(err)
    }
  })
  app.use('/api/auth', authRouter())
  return app
}

function buildProtectedApp(sql: postgres.Sql) {
  const app = express()
  app.use(express.json())
  app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }))
  app.use(passport.initialize())
  app.use(passport.session())
  passport.serializeUser((user: any, done) => done(null, user.id))
  passport.deserializeUser(async (id: unknown, done) => {
    try {
      const [user] = await sql`SELECT * FROM users WHERE id = ${id as number}`
      done(null, user ?? false)
    } catch (err) {
      done(err)
    }
  })
  app.use('/api', requireAuth, createRouter(sql, () => {}))
  return app
}

describe('GET /api/auth/me', () => {
  let sql: postgres.Sql

  beforeEach(async () => {
    if (skipIfNoDb()) return
    sql = await createSeededTestSql()
  })

  afterEach(async () => {
    if (sql) await closeTestSql(sql)
  })

  it('returns 401 when not authenticated', async () => {
    if (skipIfNoDb()) return
    const res = await request(buildApp(sql)).get('/api/auth/me')
    expect(res.status).toBe(401)
  })
})

describe('requireAuth middleware', () => {
  let sql: postgres.Sql

  beforeEach(async () => {
    if (skipIfNoDb()) return
    sql = await createSeededTestSql()
  })

  afterEach(async () => {
    if (sql) await closeTestSql(sql)
  })

  it('returns 401 on protected route when not logged in', async () => {
    if (skipIfNoDb()) return
    const res = await request(buildProtectedApp(sql)).get('/api/projects')
    expect(res.status).toBe(401)
  })
})
