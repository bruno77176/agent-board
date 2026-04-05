import { Router } from 'express'
import { randomUUID } from 'crypto'
import type { Sql } from '../db/index.js'
import { nextShortId } from '../db/index.js'
import { Broadcast } from '../ws/index.js'
import { parseFrontmatter } from '../lib/doc-parser.js'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'

export interface ParsedDoc {
  project_key: string
  epic: { title: string; description: string }
  features: Array<{
    title: string
    description: string
    stories: Array<{
      title: string
      description: string
      acceptance_criteria: Array<{ id: string; text: string; checked: boolean }>
      priority: 'high' | 'medium' | 'low'
    }>
  }>
}

/**
 * Parse markdown body into a board item tree: epic → features → stories.
 */
export function parseDocStructure(markdown: string): Omit<ParsedDoc, 'project_key'> | null {
  const lines = markdown.split('\n')

  let epicTitle = ''
  let epicDescLines: string[] = []

  type Story = ParsedDoc['features'][0]['stories'][0]
  type Feature = { title: string; descLines: string[]; stories: Story[] }

  const features: Feature[] = []
  let currentFeature: Feature | null = null
  let currentStory: (Story & { descLines: string[]; criteriaLines: string[] }) | null = null

  const pushStory = () => {
    if (currentStory && currentFeature) {
      const desc = currentStory.descLines.join('\n').trim()
      const criteria = currentStory.criteriaLines
        .map(l => l.replace(/^-\s*\[[ x]\]\s*/, '').trim())
        .filter(Boolean)
        .map(text => ({ id: randomUUID(), text, checked: false }))
      currentFeature.stories.push({
        title: currentStory.title,
        description: desc,
        acceptance_criteria: criteria,
        priority: currentStory.priority,
      })
      currentStory = null
    }
  }

  const pushFeature = () => {
    if (currentFeature) {
      features.push(currentFeature)
      currentFeature = null
    }
  }

  for (const line of lines) {
    if (line.startsWith('# ') && !epicTitle) {
      epicTitle = line.slice(2).trim().replace(/\s+Implementation Plan$/i, '').trim()
    } else if (line.startsWith('## ')) {
      pushStory()
      pushFeature()
      currentFeature = { title: line.slice(3).trim(), descLines: [], stories: [] }
    } else if (line.startsWith('### ')) {
      pushStory()
      if (!currentFeature) {
        currentFeature = { title: 'Tasks', descLines: [], stories: [] }
      }
      currentStory = {
        title: line.slice(4).trim(),
        description: '',
        acceptance_criteria: [],
        priority: 'medium',
        descLines: [],
        criteriaLines: [],
      }
    } else if (currentStory) {
      if (/^-\s*\[[ x]\]/.test(line.trim())) {
        currentStory.criteriaLines.push(line.trim())
      } else if (line.trim()) {
        currentStory.descLines.push(line.trim())
      }
    } else if (currentFeature) {
      if (line.trim()) currentFeature.descLines.push(line.trim())
    } else if (epicTitle && line.trim()) {
      epicDescLines.push(line.trim())
    }
  }
  pushStory()
  pushFeature()

  if (!epicTitle) return null

  return {
    epic: { title: epicTitle, description: epicDescLines.slice(0, 5).join(' ') },
    features: features.map(f => ({
      title: f.title,
      description: f.descLines.slice(0, 3).join(' '),
      stories: f.stories,
    })),
  }
}

/**
 * Read a file, parse it, and create board items. Idempotent — skips existing items by title.
 */
export async function syncDocToBoard(
  filePath: string,
  sql: Sql,
  broadcast: Broadcast
): Promise<{ created: boolean; message: string }> {
  const fsMod = await import('fs')
  const content = fsMod.default.readFileSync(filePath, 'utf-8')
  const { data, body } = parseFrontmatter(content)

  if (!data.project) {
    return { created: false, message: 'No project frontmatter — skipped' }
  }

  const structure = parseDocStructure(body)
  if (!structure) {
    return { created: false, message: 'No H1 heading found — skipped' }
  }

  const [project] = await sql`SELECT * FROM projects WHERE LOWER(key) = LOWER(${data.project})`
  if (!project) {
    return { created: false, message: `Project "${data.project}" not found` }
  }

  let epicId: string
  const [existingEpic] = await sql`SELECT * FROM epics WHERE project_id = ${project.id} AND title = ${structure.epic.title}`

  if (existingEpic) {
    epicId = existingEpic.id
    if (!existingEpic.source_doc) {
      await sql`UPDATE epics SET source_doc = ${filePath} WHERE id = ${epicId}`
    }
  } else {
    epicId = randomUUID()
    const epicShortId = await nextShortId(sql, project.id, 'epic')
    await sql`INSERT INTO epics (id, project_id, title, description, short_id, source_doc) VALUES (${epicId}, ${project.id}, ${structure.epic.title}, ${structure.epic.description || null}, ${epicShortId}, ${filePath})`
    const [epic] = await sql`SELECT * FROM epics WHERE id = ${epicId}`
    broadcast({ type: 'epic.created', data: epic })
  }

  let totalStories = 0

  for (const feat of structure.features) {
    const [existingFeat] = await sql`SELECT * FROM features WHERE epic_id = ${epicId} AND title = ${feat.title}`
    const featId = existingFeat?.id ?? randomUUID()

    if (!existingFeat) {
      const featShortId = await nextShortId(sql, project.id, 'feature')
      await sql`
        INSERT INTO features (id, epic_id, title, description, short_id, tags)
        VALUES (${featId}, ${epicId}, ${feat.title}, ${feat.description || null}, ${featShortId}, ${sql.json([])})
      `
      const [feature] = await sql`SELECT * FROM features WHERE id = ${featId}`
      broadcast({ type: 'feature.created', data: feature })
    }

    for (const story of feat.stories) {
      const [existingStory] = await sql`SELECT * FROM stories WHERE feature_id = ${featId} AND title = ${story.title}`
      if (existingStory) continue

      const storyId = randomUUID()
      const storyShortId = await nextShortId(sql, project.id, 'story')
      await sql`
        INSERT INTO stories (id, feature_id, title, description, priority, status, short_id, tags, acceptance_criteria)
        VALUES (${storyId}, ${featId}, ${story.title}, ${story.description || null}, ${story.priority}, 'backlog', ${storyShortId}, ${sql.json([])}, ${sql.json(story.acceptance_criteria)})
      `
      const [newStory] = await sql`SELECT * FROM stories WHERE id = ${storyId}`
      broadcast({ type: 'story.created', data: newStory })
      totalStories++
    }
  }

  const planStoryTitles = new Set(
    structure.features.flatMap((f) => f.stories.map((s) => s.title))
  )

  const existingStories = await sql`
    SELECT s.id, s.title, s.status FROM stories s
    JOIN features f ON s.feature_id = f.id
    WHERE f.epic_id = ${epicId}
    AND s.status NOT IN ('done', 'archived')
  `

  for (const story of existingStories) {
    if (!planStoryTitles.has(story.title)) {
      const wasActive = ['in_progress', 'review', 'qa'].includes(story.status)
      await sql`UPDATE stories SET status = 'archived' WHERE id = ${story.id}`
      if (wasActive) {
        await sql`
          INSERT INTO events (id, target_type, target_id, agent_id, from_status, to_status, comment)
          VALUES (${randomUUID()}, 'story', ${story.id}, null, ${story.status}, 'archived',
                  '⚠️ Archived by doc-sync — task removed from plan while in progress')
        `
      }
      const [updated] = await sql`SELECT * FROM stories WHERE id = ${story.id}`
      broadcast({ type: 'story.archived', data: updated })
    }
  }

  const msg = `Synced: Epic "${structure.epic.title}", ${structure.features.length} features, ${totalStories} new stories`
  console.log('[doc-sync]', msg)
  return { created: totalStories > 0 || !existingEpic, message: msg }
}

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
