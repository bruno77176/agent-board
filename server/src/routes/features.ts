import { Router } from 'express'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { Broadcast } from '../ws/index.js'

export function featuresRouter(db: Database.Database, broadcast: Broadcast): Router {
  const router = Router()

  router.get('/', (req, res) => {
    const { epic_id } = req.query
    const rows = (epic_id
      ? db.prepare('SELECT * FROM features WHERE epic_id = ? ORDER BY created_at').all(epic_id as string)
      : db.prepare('SELECT * FROM features ORDER BY created_at').all()) as any[]
    res.json(rows.map(r => ({ ...r, tags: JSON.parse(r.tags) })))
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
