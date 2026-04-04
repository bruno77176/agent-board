import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import type { Sql } from '../db/index.js'
import { Broadcast } from '../ws/index.js'

export function docsRouter(sql?: Sql, broadcast?: Broadcast): Router {
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

  // POST /api/docs/sync — sync a doc to the board.
  // Accepts either { file: "relative/path.md" } (server filesystem) or { content: "markdown..." } (raw content)
  router.post('/sync', async (req, res) => {
    if (!sql || !broadcast) {
      return res.status(503).json({ error: 'Sync not available — db/broadcast not configured' })
    }
    const { file, content } = req.body

    // Raw content path: write to a temp file and sync
    if (content && typeof content === 'string') {
      const os = await import('os')
      const tmpFile = `${os.default.tmpdir()}/board-doc-sync-${Date.now()}.md`
      try {
        fs.writeFileSync(tmpFile, content, 'utf-8')
        const { syncDocToBoard } = await import('../lib/doc-parser.js')
        const result = await syncDocToBoard(tmpFile, sql, broadcast)
        return res.json(result)
      } finally {
        try { fs.unlinkSync(tmpFile) } catch {}
      }
    }

    // File path: resolve against DOCS_ROOT
    if (!file || typeof file !== 'string') {
      return res.status(400).json({ error: 'file path or content required' })
    }
    const DOCS_ROOT = process.env.DOCS_PATH ?? path.resolve(process.cwd(), '..', 'docs')
    const ROOT_WITH_SEP = DOCS_ROOT.endsWith(path.sep) ? DOCS_ROOT : DOCS_ROOT + path.sep
    const resolved = path.resolve(DOCS_ROOT, file)
    if ((!resolved.startsWith(ROOT_WITH_SEP) && resolved !== DOCS_ROOT) || !resolved.endsWith('.md')) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'File not found' })

    const { syncDocToBoard } = await import('../lib/doc-parser.js')
    const result = await syncDocToBoard(resolved, sql, broadcast)
    res.json(result)
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
