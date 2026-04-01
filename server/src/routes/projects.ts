import { Router } from 'express'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { Broadcast } from '../ws/index.js'

export function projectsRouter(db: Database.Database, broadcast: Broadcast): Router {
  const router = Router()

  router.get('/', (_, res) => {
    res.json(db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all())
  })

  router.get('/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
    if (!row) return res.status(404).json({ error: 'Not found' })
    res.json(row)
  })

  router.post('/', (req, res) => {
    const { key, name, description, workflow_id } = req.body
    if (!key || !name || !workflow_id) return res.status(400).json({ error: 'key, name, workflow_id required' })
    try {
      const id = randomUUID()
      db.prepare('INSERT INTO projects (id, key, name, description, workflow_id) VALUES (?, ?, ?, ?, ?)')
        .run(id, key.toUpperCase(), name, description ?? null, workflow_id)
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
      broadcast({ type: 'project.created', data: project })
      res.status(201).json(project)
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Project key already exists' })
      throw e
    }
  })

  return router
}
