import { Router } from 'express'
import { randomUUID } from 'crypto'
import type { Sql } from '../db/index.js'
import { nextShortId } from '../db/index.js'
import { Broadcast } from '../ws/index.js'

export function epicsRouter(sql: Sql, broadcast: Broadcast): Router {
  const router = Router()

  router.get('/', async (req, res) => {
    const { project_id } = req.query
    const rows = project_id
      ? await sql`SELECT * FROM epics WHERE project_id = ${project_id as string} ORDER BY created_at DESC`
      : await sql`SELECT * FROM epics ORDER BY created_at DESC`
    res.json(rows)
  })

  router.get('/:id', async (req, res) => {
    const [epic] = await sql`SELECT * FROM epics WHERE id = ${req.params.id} OR short_id = ${req.params.id}`
    if (!epic) return res.status(404).json({ error: 'Not found' })

    const features = await sql`SELECT * FROM features WHERE epic_id = ${epic.id} ORDER BY created_at`
    const featureIds = features.map((f: any) => f.id)

    let storyCounts: any[] = []
    if (featureIds.length > 0) {
      storyCounts = await sql`
        SELECT feature_id, status, COUNT(*)::int as count
        FROM stories WHERE feature_id = ANY(${featureIds})
        GROUP BY feature_id, status
      `
    }

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
      return { ...f, story_counts: { total, ...counts } }
    })

    res.json({
      ...epic,
      features: enrichedFeatures,
      story_counts: { total: epicTotal, ...epicRollup },
    })
  })

  router.patch('/:id', async (req, res) => {
    const [epic] = await sql`SELECT * FROM epics WHERE id = ${req.params.id} OR short_id = ${req.params.id}`
    if (!epic) return res.status(404).json({ error: 'Not found' })
    const { title, description, version, status, start_date, end_date, source_doc } = req.body
    const VALID_EPIC_STATUSES = ['active', 'completed', 'cancelled']
    if (status && !VALID_EPIC_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_EPIC_STATUSES.join(', ')}` })
    }

    const hasUpdate = title !== undefined || description !== undefined || version !== undefined ||
      status !== undefined || 'start_date' in req.body || 'end_date' in req.body || 'source_doc' in req.body
    if (!hasUpdate) return res.json(epic)

    await sql`
      UPDATE epics SET
        title = COALESCE(${title ?? null}, title),
        description = COALESCE(${description ?? null}, description),
        version = COALESCE(${version ?? null}, version),
        status = COALESCE(${status ?? null}, status),
        start_date = ${'start_date' in req.body ? (start_date ?? null) : sql`start_date`},
        end_date = ${'end_date' in req.body ? (end_date ?? null) : sql`end_date`},
        source_doc = ${'source_doc' in req.body ? (source_doc ?? null) : sql`source_doc`}
      WHERE id = ${epic.id}
    `

    const [updated] = await sql`SELECT * FROM epics WHERE id = ${epic.id}`
    broadcast({ type: 'epic.updated', data: updated })
    res.json(updated)
  })

  router.delete('/:id', async (req, res) => {
    const [epic] = await sql`SELECT * FROM epics WHERE id = ${req.params.id} OR short_id = ${req.params.id}`
    if (!epic) return res.status(404).json({ error: 'Not found' })
    const features = await sql`SELECT id FROM features WHERE epic_id = ${epic.id}`
    for (const f of features) {
      const stories = await sql`SELECT id FROM stories WHERE feature_id = ${f.id}`
      for (const s of stories) {
        await sql`DELETE FROM story_links WHERE from_story_id = ${s.id} OR to_story_id = ${s.id}`
        await sql`DELETE FROM events WHERE target_id = ${s.id} AND target_type = 'story'`
      }
      await sql`DELETE FROM stories WHERE feature_id = ${f.id}`
    }
    await sql`DELETE FROM features WHERE epic_id = ${epic.id}`
    await sql`DELETE FROM epics WHERE id = ${epic.id}`
    broadcast({ type: 'epic.deleted', data: { id: epic.id, short_id: epic.short_id } })
    res.status(204).send()
  })

  router.post('/', async (req, res) => {
    const { project_id, title, description, version, source_doc } = req.body
    if (!project_id || !title) return res.status(400).json({ error: 'project_id and title required' })
    const id = randomUUID()
    const short_id = await nextShortId(sql, project_id, 'epic')
    await sql`INSERT INTO epics (id, project_id, title, description, version, short_id, source_doc)
  VALUES (${id}, ${project_id}, ${title}, ${description ?? null}, ${version ?? null}, ${short_id}, ${source_doc ?? null})`
    const [epic] = await sql`SELECT * FROM epics WHERE id = ${id}`
    broadcast({ type: 'epic.created', data: epic })
    res.status(201).json(epic)
  })

  return router
}
