import { Router } from 'express'
import fs from 'fs'
import path from 'path'

export function docsRouter(): Router {
  const router = Router()

  // GET /api/docs — list all .md files (optionally filtered by ?project=KEY)
  router.get('/', (req, res) => {
    const DOCS_ROOT = process.env.DOCS_PATH ?? path.resolve(process.cwd(), '..', 'docs')
    if (!fs.existsSync(DOCS_ROOT)) return res.json([])
    const ROOT_WITH_SEP = DOCS_ROOT.endsWith(path.sep) ? DOCS_ROOT : DOCS_ROOT + path.sep
    const { project } = req.query
    let searchRoot = DOCS_ROOT
    if (project && typeof project === 'string') {
      // Validate project doesn't contain path traversal
      if (project.includes('..') || project.includes('/') || project.includes('\\')) {
        return res.status(400).json({ error: 'Invalid project' })
      }
      searchRoot = path.join(DOCS_ROOT, project)
      if (!searchRoot.startsWith(ROOT_WITH_SEP)) {
        return res.status(400).json({ error: 'Invalid project' })
      }
      if (!fs.existsSync(searchRoot)) return res.json([])
    }
    const files = walk(searchRoot).map(f => path.relative(DOCS_ROOT, f).replace(/\\/g, '/'))
    res.json(files)
  })

  // POST /api/docs/upload — store a doc permanently so it appears in the UI
  router.post('/upload', (req, res) => {
    const { path: docPath, content } = req.body
    if (!docPath || typeof docPath !== 'string' || !content || typeof content !== 'string') {
      return res.status(400).json({ error: 'path and content required' })
    }
    if (!docPath.endsWith('.md')) {
      return res.status(400).json({ error: 'Only .md files allowed' })
    }
    const DOCS_ROOT = process.env.DOCS_PATH ?? path.resolve(process.cwd(), '..', 'docs')
    const ROOT_WITH_SEP = DOCS_ROOT.endsWith(path.sep) ? DOCS_ROOT : DOCS_ROOT + path.sep
    const resolved = path.resolve(DOCS_ROOT, docPath)
    if (!resolved.startsWith(ROOT_WITH_SEP) && resolved !== DOCS_ROOT) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const dir = path.dirname(resolved)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(resolved, content, 'utf-8')
    res.json({ ok: true, path: docPath })
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
