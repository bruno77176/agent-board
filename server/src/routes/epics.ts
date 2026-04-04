import { Router } from 'express'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { Broadcast } from '../ws/index.js'
import { nextShortId } from '../db/index.js'

export function epicsRouter(db: Database.Database, broadcast: Broadcast): Router {
  const router = Router()

  router.get('/', (req, res) => {
    const { project_id } = req.query
    const rows = project_id
      ? db.prepare('SELECT * FROM epics WHERE project_id = ? ORDER BY created_at DESC').all(project_id as string)
      : db.prepare('SELECT * FROM epics ORDER BY created_at DESC').all()
    res.json(rows)
  })

  router.get('/:id', (req, res) => {
    const epic = db.prepare('SELECT * FROM epics WHERE id = ? OR short_id = ?').get(req.params.id, req.params.id) as any
    if (!epic) return res.status(404).json({ error: 'Not found' })

    // Include features with story count rollups
    const features = db.prepare('SELECT * FROM features WHERE epic_id = ? ORDER BY created_at').all(epic.id) as any[]
    const featureIds = features.map((f: any) => f.id)

    let storyCounts: any[] = []
    if (featureIds.length > 0) {
      const placeholders = featureIds.map(() => '?').join(',')
      storyCounts = db.prepare(
        `SELECT feature_id, status, COUNT(*) as count FROM stories WHERE feature_id IN (${placeholders}) GROUP BY feature_id, status`
      ).all(...featureIds) as any[]
    }

    // Build per-feature story_counts and epic-level rollup
    const epicRollup: Record<string, number> = {}
    let epicTotal = 0
    const enrichedFeatures = features.map((f: any) => {
      const counts: Record<string, number> = {}
      let total = 0
      for (const row of storyCounts) {
        if (row.feature_id === f.id) {
          counts[row.status] = row.count
          total += row.count
          epicRollup[row.status] = (epicRollup[row.status] || 0) + row.count
        }
      }
      epicTotal += total
      return { ...f, tags: JSON.parse(f.tags), story_counts: { total, ...counts } }
    })

    res.json({
      ...epic,
      features: enrichedFeatures,
      story_counts: { total: epicTotal, ...epicRollup },
    })
  })

  router.patch('/:id', (req, res) => {
    const epic = db.prepare('SELECT * FROM epics WHERE id = ? OR short_id = ?').get(req.params.id, req.params.id) as any
    if (!epic) return res.status(404).json({ error: 'Not found' })
    const { title, description, version, status, start_date, end_date } = req.body
    const VALID_EPIC_STATUSES = ['active', 'completed', 'cancelled']
    if (status && !VALID_EPIC_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_EPIC_STATUSES.join(', ')}` })
    }

    const updates: string[] = []
    const params: any[] = []

    if (title !== undefined) { updates.push('title = ?'); params.push(title) }
    if (description !== undefined) { updates.push('description = ?'); params.push(description) }
    if (version !== undefined) { updates.push('version = ?'); params.push(version) }
    if (status !== undefined) { updates.push('status = ?'); params.push(status) }
    // For dates: allow null to clear
    if ('start_date' in req.body) { updates.push('start_date = ?'); params.push(start_date ?? null) }
    if ('end_date' in req.body) { updates.push('end_date = ?'); params.push(end_date ?? null) }

    if (updates.length === 0) return res.json(epic)
    params.push(epic.id)
    db.prepare(`UPDATE epics SET ${updates.join(', ')} WHERE id = ?`).run(...params)

    const updated = db.prepare('SELECT * FROM epics WHERE id = ?').get(epic.id)
    broadcast({ type: 'epic.updated', data: updated })
    res.json(updated)
  })

  router.delete('/:id', (req, res) => {
    const epic = db.prepare('SELECT * FROM epics WHERE id = ? OR short_id = ?').get(req.params.id, req.params.id) as any
    if (!epic) return res.status(404).json({ error: 'Not found' })
    // Cascade delete features → stories → links/events
    const features = db.prepare('SELECT id FROM features WHERE epic_id = ?').all(epic.id) as any[]
    for (const f of features) {
      const stories = db.prepare('SELECT id FROM stories WHERE feature_id = ?').all(f.id) as any[]
      for (const s of stories) {
        db.prepare('DELETE FROM story_links WHERE from_story_id = ? OR to_story_id = ?').run(s.id, s.id)
        db.prepare('DELETE FROM events WHERE target_id = ? AND target_type = ?').run(s.id, 'story')
      }
      db.prepare('DELETE FROM stories WHERE feature_id = ?').run(f.id)
    }
    db.prepare('DELETE FROM features WHERE epic_id = ?').run(epic.id)
    db.prepare('DELETE FROM epics WHERE id = ?').run(epic.id)
    broadcast({ type: 'epic.deleted', data: { id: epic.id, short_id: epic.short_id } })
    res.status(204).send()
  })

  router.post('/', (req, res) => {
    const { project_id, title, description, version } = req.body
    if (!project_id || !title) return res.status(400).json({ error: 'project_id and title required' })
    const id = randomUUID()
    const short_id = nextShortId(db, project_id, 'epic')
    db.prepare('INSERT INTO epics (id, project_id, title, description, version, short_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, project_id, title, description ?? null, version ?? null, short_id)
    const epic = db.prepare('SELECT * FROM epics WHERE id = ?').get(id)
    broadcast({ type: 'epic.created', data: epic })
    res.status(201).json(epic)
  })

  return router
}
