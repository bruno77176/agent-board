import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as GitHubStrategy } from 'passport-github2'
import postgres from 'postgres'

async function upsertUser(
  sql: postgres.Sql,
  provider: 'google' | 'github',
  provider_id: string,
  email: string,
  name: string,
  avatar_url: string | null,
): Promise<any> {
  const [existing] = await sql`
    SELECT * FROM users WHERE provider = ${provider} AND provider_id = ${provider_id}
  `

  if (existing) {
    await sql`UPDATE users SET name = ${name}, avatar_url = ${avatar_url} WHERE id = ${existing.id}`
    const [updated] = await sql`SELECT * FROM users WHERE id = ${existing.id}`
    return updated
  }

  // First ever user becomes admin + active
  const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM users`
  const role   = count === 0 ? 'admin'  : 'member'
  const status = count === 0 ? 'active' : 'pending'

  const [user] = await sql`
    INSERT INTO users (email, name, avatar_url, provider, provider_id, role, status)
    VALUES (${email}, ${name}, ${avatar_url}, ${provider}, ${provider_id}, ${role}, ${status})
    RETURNING *
  `
  return user
}

export function registerStrategies(sql: postgres.Sql): void {
  const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'

  passport.use(new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL:  `${BASE_URL}/api/auth/google/callback`,
    },
    async (_access, _refresh, profile, done) => {
      try {
        const email      = profile.emails?.[0]?.value ?? ''
        const avatar_url = profile.photos?.[0]?.value ?? null
        const user = await upsertUser(sql, 'google', profile.id, email, profile.displayName, avatar_url)
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
    async (_access: string, _refresh: string, profile: any, done: any) => {
      try {
        const email      = profile.emails?.[0]?.value ?? `${profile.username}@github`
        const avatar_url = profile.photos?.[0]?.value ?? null
        const user = await upsertUser(sql, 'github', profile.id, email, profile.displayName ?? profile.username, avatar_url)
        done(null, user)
      } catch (err) {
        done(err as Error)
      }
    }
  ))
}
