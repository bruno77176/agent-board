import { Router } from 'express'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { Broadcast } from '../ws/index.js'
import { nextShortId } from '../db/index.js'

export function featuresRouter(db: Database.Database, broadcast: Broadcast): Router {
  const router = Router()

  router.get('/', (req, res) => {
    const { epic_id, project_id } = req.query
    let rows: any[]
    if (epic_id) {
      rows = db.prepare('SELECT * FROM features WHERE epic_id = ? ORDER BY created_at').all(epic_id as string)
    } else if (project_id) {
      rows = db.prepare(
        `SELECT f.* FROM features f JOIN epics e ON f.epic_id = e.id WHERE e.project_id = ? ORDER BY f.created_at`
      ).all(project_id as string)
    } else {
      rows = db.prepare('SELECT * FROM features ORDER BY created_at').all()
    }
    res.json(rows.map((r: any) => ({ ...r, tags: JSON.parse(r.tags) })))
  })

  router.get('/:id', (req, res) => {
    const feature = db.prepare('SELECT * FROM features WHERE id = ? OR short_id = ?').get(req.params.id, req.params.id) as any
    if (!feature) return res.status(404).json({ error: 'Not found' })

    // Include child stories
    const stories = db.prepare(
      'SELECT id, short_id, title, status, priority, assigned_agent_id, estimated_minutes, created_at FROM stories WHERE feature_id = ? ORDER BY created_at'
    ).all(feature.id) as any[]

    // Story count rollup
    const counts: Record<string, number> = {}
    for (const s of stories) {
      counts[s.status] = (counts[s.status] || 0) + 1
    }

    // Parent epic info
    const epic = db.prepare('SELECT id, title, short_id FROM epics WHERE id = ?').get(feature.epic_id) as any

    res.json({
      ...feature,
      tags: JSON.parse(feature.tags),
      stories,
      story_counts: { total: stories.length, ...counts },
      epic: epic || null,
    })
  })

  router.patch('/:id', (req, res) => {
    const feature = db.prepare('SELECT * FROM features WHERE id = ? OR short_id = ?').get(req.params.id, req.params.id) as any
    if (!feature) return res.status(404).json({ error: 'Not found' })
    const { title, description, tags } = req.body

    const updates: string[] = []
    const params: any[] = []

    if (title !== undefined) { updates.push('title = ?'); params.push(title) }
    if (description !== undefined) { updates.push('description = ?'); params.push(description) }
    if (tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(tags)) }

    if (updates.length === 0) return res.json({ ...feature, tags: JSON.parse(feature.tags) })
    params.push(feature.id)
    db.prepare(`UPDATE features SET ${updates.join(', ')} WHERE id = ?`).run(...params)

    const updated = db.prepare('SELECT * FROM features WHERE id = ?').get(feature.id) as any
    const result = { ...updated, tags: JSON.parse(updated.tags) }
    broadcast({ type: 'feature.updated', data: result })
    res.json(result)
  })

  router.delete('/:id', (req, res) => {
    const feature = db.prepare('SELECT * FROM features WHERE id = ? OR short_id = ?').get(req.params.id, req.params.id) as any
    if (!feature) return res.status(404).json({ error: 'Not found' })
    // Cascade delete stories and their links/events
    const stories = db.prepare('SELECT id FROM stories WHERE feature_id = ?').all(feature.id) as any[]
    for (const s of stories) {
      db.prepare('DELETE FROM story_links WHERE from_story_id = ? OR to_story_id = ?').run(s.id, s.id)
      db.prepare('DELETE FROM events WHERE target_id = ? AND target_type = ?').run(s.id, 'story')
    }
    db.prepare('DELETE FROM stories WHERE feature_id = ?').run(feature.id)
    db.prepare('DELETE FROM features WHERE id = ?').run(feature.id)
    broadcast({ type: 'feature.deleted', data: { id: feature.id, short_id: feature.short_id } })
    res.status(204).send()
  })

  router.post('/', (req, res) => {
    const { epic_id, title, description, tags } = req.body
    if (!epic_id || !title) return res.status(400).json({ error: 'epic_id and title required' })
    const id = randomUUID()
    const epic = db.prepare('SELECT project_id FROM epics WHERE id = ?').get(epic_id) as any
    const short_id = nextShortId(db, epic.project_id, 'feature')
    db.prepare('INSERT INTO features (id, epic_id, title, description, tags, short_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, epic_id, title, description ?? null, JSON.stringify(tags ?? []), short_id)
    const feature = db.prepare('SELECT * FROM features WHERE id = ?').get(id) as any
    const result = { ...feature, tags: JSON.parse(feature.tags) }
    broadcast({ type: 'feature.created', data: result })
    res.status(201).json(result)
  })

  return router
}
