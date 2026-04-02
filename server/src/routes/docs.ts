import { Router } from 'express'
import fs from 'fs'
import path from 'path'

const DOCS_ROOT = process.env.DOCS_PATH ?? path.resolve(process.cwd(), '..', 'docs')

export function docsRouter(): Router {
  const router = Router()

  // GET /api/docs — list all .md files
  router.get('/', (_req, res) => {
    if (!fs.existsSync(DOCS_ROOT)) return res.json([])
    const files = walk(DOCS_ROOT)
      .filter(f => f.endsWith('.md'))
      .map(f => path.relative(DOCS_ROOT, f).replace(/\\/g, '/'))
    res.json(files)
  })

  // GET /api/docs/* — return file content
  router.get('/*', (req, res) => {
    const relativePath = (req.params as Record<string, string>)[0]
    if (!relativePath) return res.status(400).json({ error: 'Path required' })
    // Security: prevent path traversal
    const resolved = path.resolve(DOCS_ROOT, relativePath)
    if (!resolved.startsWith(DOCS_ROOT)) return res.status(403).json({ error: 'Forbidden' })
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'Not found' })
    const content = fs.readFileSync(resolved, 'utf-8')
    res.type('text/plain').send(content)
  })

  return router
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name)
    return fs.statSync(full).isDirectory() ? walk(full) : [full]
  })
}
