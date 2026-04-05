import fs from 'fs'
import path from 'path'
import type { Sql } from '../db/index.js'
import { Broadcast } from '../ws/index.js'
import { syncDocToBoard, archiveEpicFromDoc } from './doc-parser.js'

export function startDocWatcher(sql: Sql, docsRoot: string, broadcast: Broadcast) {
  if (!fs.existsSync(docsRoot)) {
    console.log('[doc-watcher] Docs directory not found, watcher disabled:', docsRoot)
    return
  }

  // Dynamic import of chokidar (ESM-compatible)
  import('chokidar').then(({ default: chokidar }) => {
    const watcher = chokidar.watch(path.join(docsRoot, '**', '*.md'), {
      ignoreInitial: false,
      persistent: false,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    })

    async function handleFile(filePath: string) {
      console.log('[doc-watcher] Processing:', filePath)
      try {
        const result = await syncDocToBoard(filePath, sql, broadcast)
        if (result.created) {
          broadcast({ type: 'doc.synced', data: { path: filePath, message: result.message } })
        }
        console.log('[doc-watcher]', result.message)
      } catch (err) {
        console.error('[doc-watcher] Error processing', filePath, err)
      }
    }

    watcher.on('add', handleFile)
    watcher.on('change', handleFile)

    watcher.on('unlink', async (filePath: string) => {
      console.log('[doc-watcher] File deleted:', filePath)
      try {
        await archiveEpicFromDoc(filePath, sql, broadcast)
      } catch (err) {
        console.error('[doc-watcher] Error archiving on delete', filePath, err)
      }
    })

    console.log('[doc-watcher] Watching', docsRoot)
  }).catch(err => {
    console.warn('[doc-watcher] chokidar not available, watcher disabled:', err.message)
  })
}
