import { Router } from 'express'
import type { Sql } from '../db/index.js'
import { requireAdmin } from '../middleware/auth.js'

export function adminRouter(sql: Sql): Router {
  const router = Router()
  router.use(requireAdmin)

  // Pending user count (for sidebar badge) - MUST be before /:id
  router.get('/users/pending-count', async (_req, res) => {
    const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM users WHERE status = 'pending'`
    res.json({ count })
  })

  // List all users
  router.get('/users', async (_req, res) => {
    const users = await sql`SELECT * FROM users ORDER BY created_at DESC`
    res.json(users)
  })

  // Approve user or change role
  router.patch('/users/:id', async (req, res) => {
    const { status, role } = req.body
    if (status === undefined && role === undefined) {
      return res.status(400).json({ error: 'No fields to update' })
    }
    const updated = await sql`
      UPDATE users SET
        status = COALESCE(${status ?? null}, status),
        role = COALESCE(${role ?? null}, role)
      WHERE id = ${req.params.id}
      RETURNING *
    `
    if (updated.length === 0) return res.status(404).json({ error: 'User not found' })
    res.json(updated[0])
  })

  return router
}
