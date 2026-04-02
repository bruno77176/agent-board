import { Router } from 'express'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { Broadcast } from '../ws/index.js'

export function eventsRouter(db: Database.Database, broadcast: Broadcast): Router {
  const router = Router()

  router.get('/', (req, res) => {
    const { target_id, target_type } = req.query
    let rows: any[]
    if (target_id && target_type) {
      rows = db.prepare('SELECT * FROM events WHERE target_id = ? AND target_type = ? ORDER BY created_at DESC').all(target_id as string, target_type as string)
    } else if (target_id) {
      rows = db.prepare('SELECT * FROM events WHERE target_id = ? ORDER BY created_at DESC').all(target_id as string)
    } else {
      rows = db.prepare('SELECT * FROM events ORDER BY created_at DESC LIMIT 100').all()
    }
    res.json(rows)
  })

  router.post('/', (req, res) => {
    const { target_type, target_id, agent_id, comment, from_status, to_status } = req.body
    if (!target_id || !comment) return res.status(400).json({ error: 'target_id and comment required' })
    // Resolve agent slug → UUID if needed
    let resolvedAgentId = agent_id ?? null
    if (resolvedAgentId) {
      const bySlug = db.prepare('SELECT id FROM agents WHERE slug = ?').get(resolvedAgentId) as any
      if (bySlug) resolvedAgentId = bySlug.id
    }
    const id = randomUUID()
    db.prepare('INSERT INTO events (id, target_type, target_id, agent_id, from_status, to_status, comment) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, target_type ?? 'story', target_id, resolvedAgentId, from_status ?? null, to_status ?? null, comment)
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id)
    broadcast({ type: 'event.created', data: event })
    res.status(201).json(event)
  })

  return router
}
