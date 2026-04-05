import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'http'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import passport from 'passport'
import { initDb } from './db/index.js'
import { seed } from './db/seed.js'
import { createRouter } from './routes/index.js'
import { authRouter } from './routes/auth.js'
import { requireAuth } from './middleware/auth.js'
import { createWsServer } from './ws/index.js'
import { registerStrategies } from './passport-strategies.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.set('trust proxy', 1) // Railway sits behind a reverse proxy
const server = createServer(app)
const PORT = process.env.PORT || 3000

app.use(cors({
  origin: process.env.BASE_URL ?? 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json())

async function main() {
  const sql = await initDb()
  await seed(sql)

  const PgStore = connectPgSimple(session)

  if (!process.env.SESSION_SECRET) {
    console.warn('⚠️  SESSION_SECRET not set — using insecure dev default. Set it in production!')
  }

  app.use(session({
    store: new PgStore({ conString: process.env.DATABASE_URL, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET ?? 'dev-secret-change-in-prod',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }))
  app.use(passport.initialize())
  app.use(passport.session())

  passport.serializeUser((user: any, done) => done(null, user.id))
  passport.deserializeUser(async (id: unknown, done) => {
    try {
      const [user] = await sql`SELECT * FROM users WHERE id = ${id as number}`
      done(null, user ?? false)
    } catch (err) {
      done(err)
    }
  })

  registerStrategies(sql)

  const broadcast = createWsServer(server)
  app.get('/health', (_req, res) => res.json({ ok: true }))
  app.use('/api/auth', authRouter())
  app.use('/api', requireAuth, createRouter(sql, broadcast))

  if (process.env.NODE_ENV === 'production') {
    const clientDist = path.join(__dirname, '../../client/dist')
    app.use(express.static(clientDist))
    app.get('*', (_: any, res: any) => res.sendFile(path.join(clientDist, 'index.html')))
  }

  server.listen(PORT, () => {
    console.log(`Agent Board running on http://localhost:${PORT}`)
  })
}

main().catch(err => { console.error('Startup failed:', err); process.exit(1) })
