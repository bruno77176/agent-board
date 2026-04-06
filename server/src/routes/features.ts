import { Router } from 'express'
import { randomUUID } from 'crypto'
import type { Sql } from '../db/index.js'
import { nextShortId } from '../db/index.js'
import { Broadcast } from '../ws/index.js'

export function featuresRouter(sql: Sql, broadcast: Broadcast): Router {
  const router = Router()

  router.get('/', async (req, res) => {
    const { epic_id, project_id } = req.query
    let rows: any[]
    if (epic_id) {
      const [epic] = await sql`SELECT id FROM epics WHERE id = ${epic_id as string} OR short_id = ${epic_id as string}`
      if (!epic) return res.json([])
      rows = await sql`SELECT * FROM features WHERE epic_id = ${epic.id} ORDER BY created_at`
    } else if (project_id) {
      rows = await sql`SELECT f.* FROM features f JOIN epics e ON f.epic_id = e.id WHERE e.project_id = ${project_id as string} ORDER BY f.created_at`
    } else {
      rows = await sql`SELECT * FROM features ORDER BY created_at`
    }
    res.json(rows)
  })

  router.get('/:id', async (req, res) => {
    const [feature] = await sql`SELECT * FROM features WHERE id = ${req.params.id} OR short_id = ${req.params.id}`
    if (!feature) return res.status(404).json({ error: 'Not found' })

    const stories = await sql`
      SELECT id, short_id, title, status, priority, assigned_agent_id, estimated_minutes, created_at
      FROM stories WHERE feature_id = ${feature.id} ORDER BY created_at
    `

    const counts: Record<string, number> = {}
    for (const s of stories) {
      counts[s.status] = (counts[s.status] || 0) + 1
    }

    const [epic] = await sql`SELECT id, title, short_id FROM epics WHERE id = ${feature.epic_id}`

    res.json({
      ...feature,
      stories,
      story_counts: { total: stories.length, ...counts },
      epic: epic || null,
    })
  })

  router.patch('/:id', async (req, res) => {
    const [feature] = await sql`SELECT * FROM features WHERE id = ${req.params.id} OR short_id = ${req.params.id}`
    if (!feature) return res.status(404).json({ error: 'Not found' })
    const { title, description, tags } = req.body

    if (title === undefined && description === undefined && tags === undefined) {
      return res.json(feature)
    }

    await sql`
      UPDATE features SET
        title = COALESCE(${title ?? null}, title),
        description = COALESCE(${description ?? null}, description),
        tags = COALESCE(${tags !== undefined ? sql.json(tags) : null}, tags)
      WHERE id = ${feature.id}
    `

    const [updated] = await sql`SELECT * FROM features WHERE id = ${feature.id}`
    broadcast({ type: 'feature.updated', data: updated })
    res.json(updated)
  })

  router.delete('/:id', async (req, res) => {
    const [feature] = await sql`SELECT * FROM features WHERE id = ${req.params.id} OR short_id = ${req.params.id}`
    if (!feature) return res.status(404).json({ error: 'Not found' })
    const stories = await sql`SELECT id FROM stories WHERE feature_id = ${feature.id}`
    for (const s of stories) {
      await sql`DELETE FROM story_links WHERE from_story_id = ${s.id} OR to_story_id = ${s.id}`
      await sql`DELETE FROM events WHERE target_id = ${s.id} AND target_type = 'story'`
    }
    await sql`DELETE FROM stories WHERE feature_id = ${feature.id}`
    await sql`DELETE FROM features WHERE id = ${feature.id}`
    broadcast({ type: 'feature.deleted', data: { id: feature.id, short_id: feature.short_id } })
    res.status(204).send()
  })

  router.post('/', async (req, res) => {
    const { epic_id, title, description, tags } = req.body
    if (!epic_id || !title) return res.status(400).json({ error: 'epic_id and title required' })
    const id = randomUUID()
    const [epic] = await sql`SELECT id, project_id FROM epics WHERE id = ${epic_id} OR short_id = ${epic_id}`
    if (!epic) return res.status(400).json({ error: 'Epic not found' })
    const short_id = await nextShortId(sql, epic.project_id, 'feature')
    await sql`
      INSERT INTO features (id, epic_id, title, description, tags, short_id)
      VALUES (${id}, ${epic.id}, ${title}, ${description ?? null}, ${sql.json(tags ?? [])}, ${short_id})
    `
    const [feature] = await sql`SELECT * FROM features WHERE id = ${id}`
    broadcast({ type: 'feature.created', data: feature })
    res.status(201).json(feature)
  })

  return router
}
