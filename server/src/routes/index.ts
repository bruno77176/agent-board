import { Router } from 'express'
import type { Sql } from '../db/index.js'
import { projectsRouter } from './projects.js'
import { agentsRouter } from './agents.js'
import { workflowsRouter } from './workflows.js'
import { epicsRouter } from './epics.js'
import { featuresRouter } from './features.js'
import { storiesRouter } from './stories.js'
import { eventsRouter } from './events.js'
import { docsRouter } from './docs.js'
import { adminRouter } from './admin.js'
import { aiRouter } from './ai.js'

export type { Broadcast } from '../ws/index.js'

export function createRouter(sql: Sql, broadcast: import('../ws/index.js').Broadcast): Router {
  const router = Router()
  router.use('/projects', projectsRouter(sql, broadcast))
  router.use('/agents', agentsRouter(sql))
  router.use('/workflows', workflowsRouter(sql))
  router.use('/epics', epicsRouter(sql, broadcast))
  router.use('/features', featuresRouter(sql, broadcast))
  router.use('/stories', storiesRouter(sql, broadcast))
  router.use('/events', eventsRouter(sql, broadcast))
  router.use('/docs', docsRouter())
  router.use('/admin', adminRouter(sql))
  router.use('/ai', aiRouter())
  return router
}
