import { Router } from 'express'
import { randomUUID } from 'crypto'
import type { Sql } from '../db/index.js'
import { Broadcast } from '../ws/index.js'

export function eventsRouter(sql: Sql, broadcast: Broadcast): Router {
  const router = Router()

  router.get('/', async (req, res) => {
    const { target_id, target_type } = req.query
    let rows: any[]
    if (target_id && target_type) {
      rows = await sql`SELECT * FROM events WHERE target_id = ${target_id as string} AND target_type = ${target_type as string} ORDER BY created_at DESC`
    } else if (target_id) {
      rows = await sql`SELECT * FROM events WHERE target_id = ${target_id as string} ORDER BY created_at DESC`
    } else {
      rows = await sql`SELECT * FROM events ORDER BY created_at DESC LIMIT 100`
    }
    res.json(rows)
  })

  router.post('/', async (req, res) => {
    const { target_type, target_id, agent_id, comment, from_status, to_status } = req.body
    if (!target_id || !comment) return res.status(400).json({ error: 'target_id and comment required' })
    let resolvedAgentId: string | null = agent_id ?? null
    if (resolvedAgentId) {
      const [bySlug] = await sql`SELECT id FROM agents WHERE slug = ${resolvedAgentId}`
      if (bySlug) resolvedAgentId = bySlug.id
    }
    const id = randomUUID()
    await sql`
      INSERT INTO events (id, target_type, target_id, agent_id, from_status, to_status, comment)
      VALUES (${id}, ${target_type ?? 'story'}, ${target_id}, ${resolvedAgentId}, ${from_status ?? null}, ${to_status ?? null}, ${comment})
    `
    const [event] = await sql`SELECT * FROM events WHERE id = ${id}`
    broadcast({ type: 'event.created', data: event })
    res.status(201).json(event)
  })

  return router
}
