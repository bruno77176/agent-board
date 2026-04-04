import { Router } from 'express'
import type { Sql } from '../db/index.js'
import { requireAdmin } from '../middleware/auth.js'

export function membersRouter(sql: Sql): Router {
  const router = Router({ mergeParams: true })

  router.get('/', async (req, res) => {
    const params = req.params as any
    const [project] = await sql`SELECT * FROM projects WHERE id = ${params.id} OR key = ${params.id}`
    if (!project) return res.status(404).json({ error: 'Project not found' })
    const members = await sql`
      SELECT u.id, u.email, u.name, u.avatar_url, u.role, u.status, pm.created_at as joined_at
      FROM project_members pm JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ${project.id}
      ORDER BY pm.created_at
    `
    res.json(members)
  })

  router.post('/', requireAdmin, async (req, res) => {
    const params = req.params as any
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'email required' })
    const [project] = await sql`SELECT * FROM projects WHERE id = ${params.id} OR key = ${params.id}`
    if (!project) return res.status(404).json({ error: 'Project not found' })
    const [member] = await sql`SELECT * FROM users WHERE email = ${email}`
    if (!member) return res.status(404).json({ error: 'No user with that email' })
    try {
      await sql`INSERT INTO project_members (project_id, user_id) VALUES (${project.id}, ${member.id})`
    } catch (e: any) {
      if (e.code === '23505') return res.status(409).json({ error: 'Already a member' })
      throw e
    }
    res.status(201).json({ ok: true })
  })

  router.delete('/:userId', requireAdmin, async (req, res) => {
    const params = req.params as any
    const [project] = await sql`SELECT * FROM projects WHERE id = ${params.id} OR key = ${params.id}`
    if (!project) return res.status(404).json({ error: 'Project not found' })
    const deleted = await sql`
      DELETE FROM project_members WHERE project_id = ${project.id} AND user_id = ${req.params.userId}
      RETURNING id
    `
    if (deleted.length === 0) return res.status(404).json({ error: 'Member not found' })
    res.json({ ok: true })
  })

  return router
}
