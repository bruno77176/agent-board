import { Router } from 'express'
import passport from 'passport'

export function authRouter(): Router {
  const router = Router()
  const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'

  // Google OAuth
  router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }))
  router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: `${BASE_URL}/login?error=auth_failed` }),
    (_req, res) => res.redirect(BASE_URL + '/')
  )

  // GitHub OAuth
  router.get('/github', passport.authenticate('github', { scope: ['user:email'] }))
  router.get('/github/callback',
    passport.authenticate('github', { failureRedirect: `${BASE_URL}/login?error=auth_failed` }),
    (_req, res) => res.redirect(BASE_URL + '/')
  )

  // Current user
  router.get('/me', (req, res) => {
    if (!(req as any).isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' })
    res.json(req.user)
  })

  // Logout
  router.post('/logout', (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ error: 'Logout failed' })
      res.json({ ok: true })
    })
  })

  return router
}
