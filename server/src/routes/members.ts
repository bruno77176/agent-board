import { Router } from 'express'
import Database from 'better-sqlite3'

export function membersRouter(db: Database.Database): Router {
  const router = Router({ mergeParams: true })

  // List members of a project
  router.get('/', (req, res) => {
    const params = req.params as any
    const project = db.prepare('SELECT * FROM projects WHERE id = ? OR key = ?')
      .get(params.id, params.id) as any
    if (!project) return res.status(404).json({ error: 'Project not found' })
    const members = db.prepare(`
      SELECT u.id, u.email, u.name, u.avatar_url, u.role, u.status, pm.created_at as joined_at
      FROM project_members pm JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ?
      ORDER BY pm.created_at
    `).all(project.id)
    res.json(members)
  })

  // Add member by email
  router.post('/', (req, res) => {
    const params = req.params as any
    const user = req.user as any
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'email required' })
    const project = db.prepare('SELECT * FROM projects WHERE id = ? OR key = ?')
      .get(params.id, params.id) as any
    if (!project) return res.status(404).json({ error: 'Project not found' })
    const member = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any
    if (!member) return res.status(404).json({ error: 'No user with that email' })
    try {
      db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?)').run(project.id, member.id)
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Already a member' })
      throw e
    }
    res.status(201).json({ ok: true })
  })

  // Remove member
  router.delete('/:userId', (req, res) => {
    const params = req.params as any
    const user = req.user as any
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    const project = db.prepare('SELECT * FROM projects WHERE id = ? OR key = ?')
      .get(params.id, params.id) as any
    if (!project) return res.status(404).json({ error: 'Project not found' })
    db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?')
      .run(project.id, req.params.userId)
    res.json({ ok: true })
  })

  return router
}
