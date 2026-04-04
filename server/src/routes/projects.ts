import { Router } from 'express'
import { randomUUID } from 'crypto'
import type { Sql } from '../db/index.js'
import { Broadcast } from '../ws/index.js'
import { membersRouter } from './members.js'

export function projectsRouter(sql: Sql, broadcast: Broadcast): Router {
  const router = Router()

  router.get('/', async (req, res) => {
    const user = req.user as any
    if (user.role === 'admin') {
      return res.json(await sql`SELECT * FROM projects ORDER BY created_at DESC`)
    }
    const rows = await sql`
      SELECT DISTINCT p.* FROM projects p
      LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ${user.id}
      WHERE p.is_public = 1 OR pm.user_id IS NOT NULL
      ORDER BY p.created_at DESC
    `
    res.json(rows)
  })

  router.get('/:id', async (req, res) => {
    const [row] = await sql`SELECT * FROM projects WHERE id = ${req.params.id} OR key = ${req.params.id}`
    if (!row) return res.status(404).json({ error: 'Not found' })
    res.json(row)
  })

  router.get('/:id/overview', async (req, res) => {
    const [project] = await sql`SELECT * FROM projects WHERE id = ${req.params.id} OR key = ${req.params.id}`
    if (!project) return res.status(404).json({ error: 'Not found' })

    const epics = await sql`SELECT * FROM epics WHERE project_id = ${project.id} ORDER BY created_at DESC`
    const epicIds = epics.map((e: any) => e.id)

    let features: any[] = []
    let storyCounts: any[] = []
    if (epicIds.length > 0) {
      features = await sql`SELECT * FROM features WHERE epic_id = ANY(${epicIds}) ORDER BY created_at`

      const featureIds = features.map((f: any) => f.id)
      if (featureIds.length > 0) {
        storyCounts = await sql`
          SELECT feature_id, status, COUNT(*)::int as count
          FROM stories WHERE feature_id = ANY(${featureIds})
          GROUP BY feature_id, status
        `
      }
    }

    const featureCountsMap = new Map<string, { total: number; [status: string]: number }>()
    for (const row of storyCounts) {
      if (!featureCountsMap.has(row.feature_id)) featureCountsMap.set(row.feature_id, { total: 0 })
      const entry = featureCountsMap.get(row.feature_id)!
      entry[row.status] = row.count
      entry.total += row.count
    }

    const enrichedEpics = epics.map((epic: any) => {
      const epicFeatures = features
        .filter((f: any) => f.epic_id === epic.id)
        .map((f: any) => ({
          ...f,
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

    let recentActivity: any[] = []
    if (epicIds.length > 0) {
      const featureIds = features.map((f: any) => f.id)
      if (featureIds.length > 0) {
        recentActivity = await sql`
          SELECT ev.* FROM events ev
          JOIN stories s ON ev.target_id = s.id AND ev.target_type = 'story'
          WHERE s.feature_id = ANY(${featureIds})
          ORDER BY ev.created_at DESC LIMIT 20
        `
      }
    }

    res.json({
      project,
      epics: enrichedEpics,
      recent_activity: recentActivity,
    })
  })

  router.post('/', async (req, res) => {
    const { key, name, description, workflow_id, is_public = 0 } = req.body
    if (!key || !name || !workflow_id) return res.status(400).json({ error: 'key, name, workflow_id required' })
    try {
      const id = randomUUID()
      await sql`
        INSERT INTO projects (id, key, name, description, workflow_id, is_public)
        VALUES (${id}, ${key.toUpperCase()}, ${name}, ${description ?? null}, ${workflow_id}, ${is_public ? 1 : 0})
      `
      const [project] = await sql`SELECT * FROM projects WHERE id = ${id}`
      broadcast({ type: 'project.created', data: project })
      res.status(201).json(project)
    } catch (e: any) {
      if (e.code === '23505') return res.status(409).json({ error: 'Project key already exists' })
      throw e
    }
  })

  router.patch('/:id', async (req, res) => {
    const user = req.user as any
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    const { is_public } = req.body
    const updated = await sql`
      UPDATE projects SET is_public = ${is_public ? 1 : 0}
      WHERE id = ${req.params.id} OR key = ${req.params.id}
      RETURNING *
    `
    if (updated.length === 0) return res.status(404).json({ error: 'Not found' })
    broadcast({ type: 'project.updated', data: updated[0] })
    res.json(updated[0])
  })

  router.use('/:id/members', membersRouter(sql))

  return router
}
