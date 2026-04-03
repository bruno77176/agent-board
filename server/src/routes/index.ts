import { Router } from 'express'
import Database from 'better-sqlite3'
import { projectsRouter } from './projects.js'
import { agentsRouter } from './agents.js'
import { workflowsRouter } from './workflows.js'
import { epicsRouter } from './epics.js'
import { featuresRouter } from './features.js'
import { storiesRouter } from './stories.js'
import { eventsRouter } from './events.js'
import { docsRouter } from './docs.js'

export type { Broadcast } from '../ws/index.js'

export function createRouter(db: Database.Database, broadcast: import('../ws/index.js').Broadcast): Router {
  const router = Router()
  router.use('/projects', projectsRouter(db, broadcast))
  router.use('/agents', agentsRouter(db))
  router.use('/workflows', workflowsRouter(db))
  router.use('/epics', epicsRouter(db, broadcast))
  router.use('/features', featuresRouter(db, broadcast))
  router.use('/stories', storiesRouter(db, broadcast))
  router.use('/events', eventsRouter(db, broadcast))
  router.use('/docs', docsRouter(db, broadcast))
  return router
}
