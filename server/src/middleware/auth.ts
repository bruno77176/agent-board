import { Request, Response, NextFunction } from 'express'

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated()) return next()
  res.status(401).json({ error: 'Authentication required' })
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = req.user as any
  if (user?.role === 'admin') return next()
  res.status(403).json({ error: 'Admin access required' })
}
