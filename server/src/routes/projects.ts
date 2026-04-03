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
    const row = db.prepare('SELECT * FROM projects WHERE id = ? OR key = ?').get(req.params.id, req.params.id)
    if (!row) return res.status(404).json({ error: 'Not found' })
    res.json(row)
  })

  router.get('/:id/overview', (req, res) => {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? OR key = ?').get(req.params.id, req.params.id) as any
    if (!project) return res.status(404).json({ error: 'Not found' })

    const epics = db.prepare('SELECT * FROM epics WHERE project_id = ? ORDER BY created_at DESC').all(project.id) as any[]
    const epicIds = epics.map((e: any) => e.id)

    let features: any[] = []
    let storyCounts: any[] = []
    if (epicIds.length > 0) {
      const placeholders = epicIds.map(() => '?').join(',')
      features = db.prepare(
        `SELECT * FROM features WHERE epic_id IN (${placeholders}) ORDER BY created_at`
      ).all(...epicIds) as any[]

      const featureIds = features.map((f: any) => f.id)
      if (featureIds.length > 0) {
        const fPlaceholders = featureIds.map(() => '?').join(',')
        storyCounts = db.prepare(
          `SELECT feature_id, status, COUNT(*) as count FROM stories WHERE feature_id IN (${fPlaceholders}) GROUP BY feature_id, status`
        ).all(...featureIds) as any[]
      }
    }

    // Build story counts map by feature_id
    const featureCountsMap = new Map<string, { total: number; [status: string]: number }>()
    for (const row of storyCounts) {
      if (!featureCountsMap.has(row.feature_id)) featureCountsMap.set(row.feature_id, { total: 0 })
      const entry = featureCountsMap.get(row.feature_id)!
      entry[row.status] = row.count
      entry.total += row.count
    }

    // Nest features under epics with rollups
    const enrichedEpics = epics.map((epic: any) => {
      const epicFeatures = features
        .filter((f: any) => f.epic_id === epic.id)
        .map((f: any) => ({
          ...f,
          tags: JSON.parse(f.tags),
          story_counts: featureCountsMap.get(f.id) || { total: 0 },
        }))

      const epicRollup: Record<string, number> = {}
      let epicTotal = 0
      for (const f of epicFeatures) {
        for (const [key, val] of Object.entries(f.story_counts)) {
          if (key === 'total') { epicTotal += val as number; continue }
          epicRollup[key] = (epicRollup[key] || 0) + (val as number)
        }
      }

      return {
        ...epic,
        features: epicFeatures,
        story_counts: { total: epicTotal, ...epicRollup },
      }
    })

    // Recent activity (last 20 events for this project's entities)
    let recentActivity: any[] = []
    if (epicIds.length > 0) {
      const featureIds = features.map((f: any) => f.id)
      if (featureIds.length > 0) {
        const fPlaceholders = featureIds.map(() => '?').join(',')
        recentActivity = db.prepare(
          `SELECT ev.* FROM events ev
           JOIN stories s ON ev.target_id = s.id AND ev.target_type = 'story'
           WHERE s.feature_id IN (${fPlaceholders})
           ORDER BY ev.created_at DESC LIMIT 20`
        ).all(...featureIds) as any[]
      }
    }

    res.json({
      project,
      epics: enrichedEpics,
      recent_activity: recentActivity,
    })
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
