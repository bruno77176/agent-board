import { Router } from 'express'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { Broadcast } from '../ws/index.js'

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
