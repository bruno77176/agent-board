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
