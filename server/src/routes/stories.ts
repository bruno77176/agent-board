import { Router } from 'express'
import { randomUUID } from 'crypto'
import type { Sql } from '../db/index.js'
import { nextShortId } from '../db/index.js'
import { Broadcast } from '../ws/index.js'
import { storyLinksRouter } from './story-links.js'

export function storiesRouter(sql: Sql, broadcast: Broadcast): Router {
  const router = Router()

  router.get('/', async (req, res) => {
    const { feature_id, project_id, status, agent_id } = req.query
    let rows: any[]
    if (feature_id) {
      const [feature] = await sql`SELECT id FROM features WHERE id = ${feature_id as string} OR short_id = ${feature_id as string}`
      const resolvedFeatureId = feature?.id ?? feature_id as string
      rows = await sql`SELECT * FROM stories WHERE feature_id = ${resolvedFeatureId} ORDER BY created_at`
    } else if (project_id) {
      let resolvedAgentId: string | null = null
      if (agent_id) {
        const [agent] = await sql`SELECT id FROM agents WHERE slug = ${agent_id as string} OR id = ${agent_id as string}`
        resolvedAgentId = agent?.id ?? agent_id as string
      }
      rows = await sql`
        SELECT s.* FROM stories s
        JOIN features f ON s.feature_id = f.id
        JOIN epics e ON f.epic_id = e.id
        WHERE e.project_id = ${project_id as string}
        ${status ? sql`AND s.status = ${status as string}` : sql``}
        ${resolvedAgentId ? sql`AND s.assigned_agent_id = ${resolvedAgentId}` : sql``}
        ORDER BY s.created_at DESC
      `
    } else {
      rows = await sql`SELECT * FROM stories ORDER BY created_at DESC`
    }
    res.json(rows)
  })

  router.get('/:id', async (req, res) => {
    const [story] = await sql`SELECT * FROM stories WHERE id = ${req.params.id} OR short_id = ${req.params.id}`
    if (!story) return res.status(404).json({ error: 'Not found' })
    const events = await sql`SELECT * FROM events WHERE target_id = ${story.id} AND target_type = 'story' ORDER BY created_at`
    const links = await sql`SELECT * FROM story_links WHERE from_story_id = ${story.id} OR to_story_id = ${story.id} ORDER BY created_at`
    res.json({ ...story, events, links })
  })

  router.post('/', async (req, res) => {
    const { feature_id, title, description, priority, tags, estimated_minutes, parent_story_id } = req.body
    if (!feature_id || !title) return res.status(400).json({ error: 'feature_id and title required' })
    const id = randomUUID()
    const [featureRow] = await sql`
      SELECT f.id, e.project_id FROM features f
      JOIN epics e ON f.epic_id = e.id
      WHERE f.id = ${feature_id} OR f.short_id = ${feature_id}
    `
    if (!featureRow) return res.status(400).json({ error: 'Feature not found' })
    const short_id = await nextShortId(sql, featureRow.project_id, 'story')
    await sql`
      INSERT INTO stories (id, feature_id, parent_story_id, title, description, priority, tags, estimated_minutes, short_id)
      VALUES (
        ${id}, ${featureRow.id}, ${parent_story_id ?? null}, ${title}, ${description ?? null},
        ${priority ?? 'medium'}, ${sql.json(tags ?? [])}, ${estimated_minutes ?? null}, ${short_id}
      )
    `
    const [story] = await sql`SELECT * FROM stories WHERE id = ${id}`
    broadcast({ type: 'story.created', data: story })
    res.status(201).json(story)
  })

  router.patch('/:id/status', async (req, res) => {
    const { status, agent_id, comment } = req.body
    if (!status) return res.status(400).json({ error: 'status required' })
    const [story] = await sql`SELECT * FROM stories WHERE id = ${req.params.id} OR short_id = ${req.params.id}`
    if (!story) return res.status(404).json({ error: 'Not found' })
    let resolvedAgentId: string | null = agent_id ?? null
    if (resolvedAgentId) {
      const [bySlug] = await sql`SELECT id FROM agents WHERE slug = ${resolvedAgentId}`
      if (bySlug) resolvedAgentId = bySlug.id
    }
    await sql`UPDATE stories SET status = ${status}, assigned_agent_id = COALESCE(${resolvedAgentId}, assigned_agent_id) WHERE id = ${story.id}`
    await sql`
      INSERT INTO events (id, target_type, target_id, agent_id, from_status, to_status, comment)
      VALUES (${randomUUID()}, 'story', ${story.id}, ${resolvedAgentId}, ${story.status}, ${status}, ${comment ?? null})
    `
    const [updated] = await sql`SELECT * FROM stories WHERE id = ${story.id}`
    broadcast({ type: 'story.status_changed', data: updated })
    res.json(updated)
  })

  router.patch('/:id', async (req, res) => {
    const { title, description, priority, estimated_minutes, tags, git_branch, assigned_agent_id, acceptance_criteria } = req.body
    const [story] = await sql`SELECT * FROM stories WHERE id = ${req.params.id} OR short_id = ${req.params.id}`
    if (!story) return res.status(404).json({ error: 'Not found' })
    await sql`
      UPDATE stories SET
        title = COALESCE(${title ?? null}, title),
        description = COALESCE(${description ?? null}, description),
        priority = COALESCE(${priority ?? null}, priority),
        estimated_minutes = COALESCE(${estimated_minutes ?? null}, estimated_minutes),
        tags = COALESCE(${tags !== undefined ? sql.json(tags) : null}, tags),
        git_branch = COALESCE(${git_branch ?? null}, git_branch),
        assigned_agent_id = COALESCE(${assigned_agent_id ?? null}, assigned_agent_id),
        acceptance_criteria = COALESCE(${acceptance_criteria !== undefined ? sql.json(acceptance_criteria) : null}, acceptance_criteria)
      WHERE id = ${story.id}
    `
    const [updated] = await sql`SELECT * FROM stories WHERE id = ${story.id}`
    broadcast({ type: 'story.updated', data: updated })
    res.json(updated)
  })

  router.delete('/:id', async (req, res) => {
    const [story] = await sql`SELECT * FROM stories WHERE id = ${req.params.id} OR short_id = ${req.params.id}`
    if (!story) return res.status(404).json({ error: 'Not found' })
    await sql`DELETE FROM story_links WHERE from_story_id = ${story.id} OR to_story_id = ${story.id}`
    await sql`DELETE FROM events WHERE target_id = ${story.id} AND target_type = 'story'`
    await sql`DELETE FROM stories WHERE id = ${story.id}`
    broadcast({ type: 'story.deleted', data: { id: story.id, short_id: story.short_id } })
    res.status(204).send()
  })

  router.use('/:id/links', storyLinksRouter(sql, broadcast))

  return router
}
