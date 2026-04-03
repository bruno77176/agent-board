import express from 'express'
import cors from 'cors'
import path from 'path'
import { createServer } from 'http'
import session from 'express-session'
import BetterSqliteStore from 'better-sqlite3-session-store'
import passport from 'passport'
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

const SqliteStore = BetterSqliteStore(session)

app.use(session({
  store: new SqliteStore({ client: db }),
  secret: process.env.SESSION_SECRET ?? 'dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}))
app.use(passport.initialize())
app.use(passport.session())

passport.serializeUser((user: any, done) => done(null, user.id))
passport.deserializeUser((id: number, done) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    done(null, user ?? false)
  } catch (err) {
    done(err)
  }
})

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
