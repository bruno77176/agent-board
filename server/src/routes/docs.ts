import { Router } from 'express'
import fs from 'fs'
import path from 'path'

export function docsRouter(): Router {
  const router = Router()

  // GET /api/docs — list all .md files
  router.get('/', (_req, res) => {
    const DOCS_ROOT = process.env.DOCS_PATH ?? path.resolve(process.cwd(), '..', 'docs')
    if (!fs.existsSync(DOCS_ROOT)) return res.json([])
    const files = walk(DOCS_ROOT)
      .map(f => path.relative(DOCS_ROOT, f).replace(/\\/g, '/'))
    res.json(files)
  })

  // GET /api/docs/* — return file content
  router.get('/*', (req, res) => {
    const DOCS_ROOT = process.env.DOCS_PATH ?? path.resolve(process.cwd(), '..', 'docs')
    const relativePath = (req.params as Record<string, string>)[0]
    if (!relativePath) return res.status(400).json({ error: 'Path required' })
    // Security: prevent path traversal
    const resolved = path.resolve(DOCS_ROOT, relativePath)
    const ROOT_WITH_SEP = DOCS_ROOT.endsWith(path.sep) ? DOCS_ROOT : DOCS_ROOT + path.sep
    if (!resolved.startsWith(ROOT_WITH_SEP) && resolved !== DOCS_ROOT) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    // Security: only serve .md files
    if (!resolved.endsWith('.md')) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'Not found' })
    const content = fs.readFileSync(resolved, 'utf-8')
    res.type('text/plain').send(content)
  })

  return router
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name)
    const stat = fs.lstatSync(full)
    if (stat.isSymbolicLink()) return []
    return stat.isDirectory() ? walk(full) : full.endsWith('.md') ? [full] : []
  })
}
