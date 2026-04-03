import { Router } from 'express'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

function parseSkills(raw: string | null): { name: string; content: string }[] {
  const parsed = JSON.parse(raw ?? '[]')
  // Normalize legacy string[] format to {name, content}[]
  return parsed.map((s: any) => typeof s === 'string' ? { name: s, content: '' } : s)
}

export function agentsRouter(db: Database.Database): Router {
  const router = Router()

  router.get('/', (_, res) => {
    const rows = db.prepare('SELECT * FROM agents ORDER BY name').all() as any[]
    res.json(rows.map(r => ({ ...r, skills: parseSkills(r.skills) })))
  })

  router.get('/:slug', (req, res) => {
    const agent = db.prepare('SELECT * FROM agents WHERE slug = ?').get(req.params.slug) as any
    if (!agent) return res.status(404).json({ error: 'Not found' })
    res.json({ ...agent, skills: parseSkills(agent.skills) })
  })

  router.get('/:slug/stories', (req, res) => {
    const agent = db.prepare('SELECT * FROM agents WHERE slug = ?').get(req.params.slug) as any
    if (!agent) return res.status(404).json({ error: 'Not found' })
    const rows = db.prepare('SELECT * FROM stories WHERE assigned_agent_id = ? ORDER BY created_at DESC').all(agent.id) as any[]
    res.json(rows.map(r => ({ ...r, tags: JSON.parse(r.tags ?? '[]'), acceptance_criteria: JSON.parse(r.acceptance_criteria ?? '[]') })))
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
      const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as any
      res.status(201).json({ ...agent, skills: parseSkills(agent.skills) })
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Agent slug already exists' })
      throw e
    }
  })

  router.patch('/:slug', (req, res) => {
    const agent = db.prepare('SELECT * FROM agents WHERE slug = ?').get(req.params.slug) as any
    if (!agent) return res.status(404).json({ error: 'Not found' })
    const { name, scope, color, avatar_emoji, skills } = req.body
    const updates: string[] = []
    const params: any[] = []
    if (name !== undefined) { updates.push('name = ?'); params.push(name) }
    if (scope !== undefined) { updates.push('scope = ?'); params.push(scope) }
    if (color !== undefined) { updates.push('color = ?'); params.push(color) }
    if (avatar_emoji !== undefined) { updates.push('avatar_emoji = ?'); params.push(avatar_emoji) }
    if (skills !== undefined) { updates.push('skills = ?'); params.push(JSON.stringify(skills)) }
    if (updates.length === 0) return res.json({ ...agent, skills: parseSkills(agent.skills) })
    params.push(agent.id)
    db.prepare(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`).run(...params)
    const updated = db.prepare('SELECT * FROM agents WHERE id = ?').get(agent.id) as any
    res.json({ ...updated, skills: parseSkills(updated.skills) })
  })

  return router
}
