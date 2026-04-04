import { Router } from 'express'
import { randomUUID } from 'crypto'
import type { Sql } from '../db/index.js'

export function agentsRouter(sql: Sql): Router {
  const router = Router()

  router.get('/', async (_, res) => {
    const rows = await sql`SELECT * FROM agents ORDER BY name`
    res.json(rows)
  })

  router.get('/:slug', async (req, res) => {
    const [agent] = await sql`SELECT * FROM agents WHERE slug = ${req.params.slug}`
    if (!agent) return res.status(404).json({ error: 'Not found' })
    res.json(agent)
  })

  router.get('/:slug/stories', async (req, res) => {
    const [agent] = await sql`SELECT * FROM agents WHERE slug = ${req.params.slug}`
    if (!agent) return res.status(404).json({ error: 'Not found' })
    const rows = await sql`SELECT * FROM stories WHERE assigned_agent_id = ${agent.id} ORDER BY created_at DESC`
    res.json(rows)
  })

  router.post('/', async (req, res) => {
    const { slug, name, scope, color, avatar_emoji } = req.body
    if (!slug || !name || !color || !avatar_emoji) {
      return res.status(400).json({ error: 'slug, name, color, avatar_emoji required' })
    }
    try {
      const id = randomUUID()
      await sql`INSERT INTO agents (id, slug, name, scope, color, avatar_emoji) VALUES (${id}, ${slug}, ${name}, ${scope ?? null}, ${color}, ${avatar_emoji})`
      const [agent] = await sql`SELECT * FROM agents WHERE id = ${id}`
      res.status(201).json(agent)
    } catch (e: any) {
      if (e.code === '23505') return res.status(409).json({ error: 'Agent slug already exists' })
      throw e
    }
  })

  router.patch('/:slug', async (req, res) => {
    const [agent] = await sql`SELECT * FROM agents WHERE slug = ${req.params.slug}`
    if (!agent) return res.status(404).json({ error: 'Not found' })
    const { name, scope, color, avatar_emoji, skills } = req.body
    if (name === undefined && scope === undefined && color === undefined && avatar_emoji === undefined && skills === undefined) {
      return res.json(agent)
    }
    await sql`
      UPDATE agents SET
        name = COALESCE(${name ?? null}, name),
        scope = COALESCE(${scope ?? null}, scope),
        color = COALESCE(${color ?? null}, color),
        avatar_emoji = COALESCE(${avatar_emoji ?? null}, avatar_emoji),
        skills = COALESCE(${skills !== undefined ? sql.json(skills) : null}, skills)
      WHERE id = ${agent.id}
    `
    const [updated] = await sql`SELECT * FROM agents WHERE id = ${agent.id}`
    res.json(updated)
  })

  return router
}
