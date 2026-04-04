import { Router } from 'express'
import type { Sql } from '../db/index.js'

export function workflowsRouter(sql: Sql): Router {
  const router = Router()

  router.get('/', async (_, res) => {
    const rows = await sql`SELECT * FROM workflows`
    res.json(rows)
  })

  return router
}
