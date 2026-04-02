import { Router } from 'express'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { Broadcast } from '../ws/index.js'

export function storiesRouter(db: Database.Database, broadcast: Broadcast): Router {
  const router = Router()

  router.get('/', (req, res) => {
    const { feature_id, project_id } = req.query
    let rows: any[]
    if (feature_id) {
      rows = db.prepare('SELECT * FROM stories WHERE feature_id = ? ORDER BY created_at').all(feature_id as string)
    } else if (project_id) {
      rows = db.prepare(`
        SELECT s.* FROM stories s
        JOIN features f ON s.feature_id = f.id
        JOIN epics e ON f.epic_id = e.id
        WHERE e.project_id = ?
        ORDER BY s.created_at DESC
      `).all(project_id as string)
    } else {
      rows = db.prepare('SELECT * FROM stories ORDER BY created_at DESC').all()
    }
    res.json(rows.map((r: any) => ({ ...r, tags: JSON.parse(r.tags ?? '[]'), acceptance_criteria: JSON.parse(r.acceptance_criteria ?? '[]') })))
  })

  router.get('/:id', (req, res) => {
    const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id) as any
    if (!story) return res.status(404).json({ error: 'Not found' })
    const events = db.prepare("SELECT * FROM events WHERE target_id = ? AND target_type = 'story' ORDER BY created_at").all(story.id)
    res.json({ ...story, tags: JSON.parse(story.tags ?? '[]'), acceptance_criteria: JSON.parse(story.acceptance_criteria ?? '[]'), events })
  })

  router.post('/', (req, res) => {
    const { feature_id, title, description, priority, tags, estimated_minutes, parent_story_id } = req.body
    if (!feature_id || !title) return res.status(400).json({ error: 'feature_id and title required' })
    const id = randomUUID()
    db.prepare(`INSERT INTO stories (id, feature_id, parent_story_id, title, description, priority, tags, estimated_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, feature_id, parent_story_id ?? null, title, description ?? null,
           priority ?? 'medium', JSON.stringify(tags ?? []), estimated_minutes ?? null)
    const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(id) as any
    const result = { ...story, tags: JSON.parse(story.tags ?? '[]'), acceptance_criteria: JSON.parse(story.acceptance_criteria ?? '[]') }
    broadcast({ type: 'story.created', data: result })
    res.status(201).json(result)
  })

  router.patch('/:id/status', (req, res) => {
    const { status, agent_id, comment } = req.body
    if (!status) return res.status(400).json({ error: 'status required' })
    const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id) as any
    if (!story) return res.status(404).json({ error: 'Not found' })
    // Resolve agent slug → UUID if needed
    let resolvedAgentId = agent_id ?? null
    if (resolvedAgentId) {
      const bySlug = db.prepare('SELECT id FROM agents WHERE slug = ?').get(resolvedAgentId) as any
      if (bySlug) resolvedAgentId = bySlug.id
    }
    db.prepare('UPDATE stories SET status = ?, assigned_agent_id = COALESCE(?, assigned_agent_id) WHERE id = ?')
      .run(status, resolvedAgentId, story.id)
    db.prepare('INSERT INTO events (id, target_type, target_id, agent_id, from_status, to_status, comment) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), 'story', story.id, resolvedAgentId, story.status, status, comment ?? null)
    const updated = db.prepare('SELECT * FROM stories WHERE id = ?').get(story.id) as any
    const result = { ...updated, tags: JSON.parse(updated.tags ?? '[]'), acceptance_criteria: JSON.parse(updated.acceptance_criteria ?? '[]') }
    broadcast({ type: 'story.status_changed', data: result })
    res.json(result)
  })

  router.patch('/:id', (req, res) => {
    const { title, description, priority, estimated_minutes, tags, git_branch, assigned_agent_id, acceptance_criteria } = req.body
    const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id) as any
    if (!story) return res.status(404).json({ error: 'Not found' })
    db.prepare(`UPDATE stories SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      priority = COALESCE(?, priority),
      estimated_minutes = COALESCE(?, estimated_minutes),
      tags = COALESCE(?, tags),
      git_branch = COALESCE(?, git_branch),
      assigned_agent_id = COALESCE(?, assigned_agent_id),
      acceptance_criteria = COALESCE(?, acceptance_criteria)
      WHERE id = ?`).run(
        title ?? null, description ?? null, priority ?? null,
        estimated_minutes ?? null,
        tags ? JSON.stringify(tags) : null, git_branch ?? null,
        assigned_agent_id ?? null,
        acceptance_criteria ? JSON.stringify(acceptance_criteria) : null,
        story.id
    )
    const updated = db.prepare('SELECT * FROM stories WHERE id = ?').get(story.id) as any
    const result = { ...updated, tags: JSON.parse(updated.tags ?? '[]'), acceptance_criteria: JSON.parse(updated.acceptance_criteria ?? '[]') }
    broadcast({ type: 'story.updated', data: result })
    res.json(result)
  })

  return router
}
