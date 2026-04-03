import { Router } from 'express'
import Database from 'better-sqlite3'
import { requireAdmin } from '../middleware/auth.js'

export function adminRouter(db: Database.Database): Router {
  const router = Router()
  router.use(requireAdmin)

  // Pending user count (for sidebar badge) - MUST be before /:id
  router.get('/users/pending-count', (_req, res) => {
    const { count } = db.prepare(
      "SELECT COUNT(*) as count FROM users WHERE status = 'pending'"
    ).get() as any
    res.json({ count })
  })

  // List all users
  router.get('/users', (_req, res) => {
    const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all()
    res.json(users)
  })

  // Approve user or change role
  router.patch('/users/:id', (req, res) => {
    const { status, role } = req.body
    const updates: string[] = []
    const values: any[] = []
    if (status !== undefined) { updates.push('status = ?'); values.push(status) }
    if (role   !== undefined) { updates.push('role = ?');   values.push(role)   }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' })
    values.push(req.params.id)
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json(user)
  })

  return router
}
