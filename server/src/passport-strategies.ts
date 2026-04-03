import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as GitHubStrategy } from 'passport-github2'
import Database from 'better-sqlite3'

function upsertUser(
  db: Database.Database,
  provider: 'google' | 'github',
  provider_id: string,
  email: string,
  name: string,
  avatar_url: string | null,
): any {
  const existing = db.prepare(
    'SELECT * FROM users WHERE provider = ? AND provider_id = ?'
  ).get(provider, provider_id) as any

  if (existing) {
    db.prepare('UPDATE users SET name = ?, avatar_url = ? WHERE id = ?')
      .run(name, avatar_url, existing.id)
    return db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id)
  }

  // First ever user becomes admin + active
  const { count } = db.prepare('SELECT COUNT(*) as count FROM users').get() as any
  const role  = count === 0 ? 'admin'  : 'member'
  const status = count === 0 ? 'active' : 'pending'

  db.prepare(
    'INSERT INTO users (email, name, avatar_url, provider, provider_id, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(email, name, avatar_url, provider, provider_id, role, status)

  return db.prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?')
    .get(provider, provider_id)
}

export function registerStrategies(db: Database.Database): void {
  const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'

  passport.use(new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL:  `${BASE_URL}/api/auth/google/callback`,
    },
    (_access, _refresh, profile, done) => {
      try {
        const email      = profile.emails?.[0]?.value ?? ''
        const avatar_url = profile.photos?.[0]?.value ?? null
        const user = upsertUser(db, 'google', profile.id, email, profile.displayName, avatar_url)
        done(null, user)
      } catch (err) {
        done(err as Error)
      }
    }
  ))

  passport.use(new GitHubStrategy(
    {
      clientID:     process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      callbackURL:  `${BASE_URL}/api/auth/github/callback`,
    },
    (_access: string, _refresh: string, profile: any, done: any) => {
      try {
        const email      = profile.emails?.[0]?.value ?? `${profile.username}@github`
        const avatar_url = profile.photos?.[0]?.value ?? null
        const user = upsertUser(db, 'github', profile.id, email, profile.displayName ?? profile.username, avatar_url)
        done(null, user)
      } catch (err) {
        done(err as Error)
      }
    }
  ))
}
