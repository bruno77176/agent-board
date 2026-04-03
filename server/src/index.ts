import express from 'express'
import cors from 'cors'
import path from 'path'
import { createServer } from 'http'
import { getDb } from './db/index.js'
import { seed } from './db/seed.js'
import { createRouter } from './routes/index.js'
import { createWsServer } from './ws/index.js'
import { startDocWatcher } from './lib/doc-watcher.js'

const app = express()
const server = createServer(app)
const PORT = process.env.PORT || 3000

const db = getDb()
seed(db)

app.use(cors())
app.use(express.json())

const broadcast = createWsServer(server)
app.use('/api', createRouter(db, broadcast))

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist')
  app.use(express.static(clientDist))
  app.get('*', (_: any, res: any) => res.sendFile(path.join(clientDist, 'index.html')))
}

const DOCS_ROOT = process.env.DOCS_PATH ?? path.resolve(process.cwd(), '..', 'docs')
startDocWatcher(db, DOCS_ROOT, broadcast)

server.listen(PORT, () => {
  console.log(`Agent Board running on http://localhost:${PORT}`)
})
