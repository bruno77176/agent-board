import { Router } from 'express'
import Database from 'better-sqlite3'

export function workflowsRouter(db: Database.Database): Router {
  const router = Router()

  router.get('/', (_, res) => {
    const rows = db.prepare('SELECT * FROM workflows').all() as any[]
    res.json(rows.map(r => ({ ...r, states: JSON.parse(r.states), transitions: JSON.parse(r.transitions) })))
  })

  return router
}
