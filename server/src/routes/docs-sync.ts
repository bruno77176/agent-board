import { Router } from 'express'
import type { Sql } from '../db/index.js'
import { Broadcast } from '../ws/index.js'
import { syncDocToBoard } from '../lib/doc-parser.js'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'

export function docsSyncRouter(sql: Sql, broadcast: Broadcast): Router {
  const router = Router()

  // POST /api/docs/sync — accept { content: string } markdown body and sync to board
  router.post('/sync', async (req, res) => {
    const { content } = req.body
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content (string) required' })
    }
    // Write to a temp file and use existing syncDocToBoard
    const tmpFile = path.join(os.tmpdir(), `board-doc-sync-${Date.now()}.md`)
    try {
      fs.writeFileSync(tmpFile, content, 'utf-8')
      const result = await syncDocToBoard(tmpFile, sql, broadcast)
      res.json(result)
    } finally {
      try { fs.unlinkSync(tmpFile) } catch {}
    }
  })

  return router
}
