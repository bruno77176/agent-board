import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { nextShortId } from '../db/index.js'
import { Broadcast } from '../ws/index.js'

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
 * Parse YAML frontmatter from a markdown string.
 * Returns data object and the body (without frontmatter).
 */
function parseFrontmatter(content: string): { data: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { data: {}, body: content }
  const data: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim()
      const value = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '')
      if (key) data[key] = value
    }
  }
  return { data, body: match[2] }
}

/**
 * Parse markdown body into a board item tree: epic → features → stories.
 * Rules:
 *   H1 (#)  → epic title (first one wins)
 *   H2 (##) → feature
 *   H3 (###) → story under current feature
 *   Lines starting with "- [ ]", "- [x]", "**Step N:**", or "**Step N.**" under an H3 → acceptance criteria
 *   All other content under a heading accumulates as its description
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
        .map(l => l.replace(/^-\s*\[[ x]\]\s*/, '').replace(/^\*\*Step\s*\d+[:.]?\*\*\s*/i, '').trim())
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

  const isAcceptanceCriteriaLine = (line: string) =>
    /^-\s*\[[ x]\]/.test(line) || /^\*\*Step\s*\d+[:.]?\*\*/i.test(line)

  for (const line of lines) {
    if (line.startsWith('# ') && !epicTitle) {
      epicTitle = line.slice(2).trim()
    } else if (line.startsWith('## ')) {
      pushStory()
      pushFeature()
      currentFeature = { title: line.slice(3).trim(), descLines: [], stories: [] }
    } else if (line.startsWith('### ') && currentFeature) {
      pushStory()
      currentStory = {
        title: line.slice(4).trim(),
        description: '',
        acceptance_criteria: [],
        priority: 'medium',
        descLines: [],
        criteriaLines: [],
      }
    } else if (currentStory) {
      if (isAcceptanceCriteriaLine(line.trim())) {
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
  db: Database.Database,
  broadcast: Broadcast
): Promise<{ created: boolean; message: string }> {
  const fs = await import('fs')
  const content = fs.default.readFileSync(filePath, 'utf-8')
  const { data, body } = parseFrontmatter(content)

  if (!data.project) {
    return { created: false, message: 'No project frontmatter — skipped' }
  }

  const structure = parseDocStructure(body)
  if (!structure) {
    return { created: false, message: 'No H1 heading found — skipped' }
  }

  // Look up project
  const project = db.prepare('SELECT * FROM projects WHERE key = ? COLLATE NOCASE').get(data.project) as any
  if (!project) {
    return { created: false, message: `Project "${data.project}" not found` }
  }

  // Idempotency: check if epic already exists
  const existingEpic = db.prepare('SELECT * FROM epics WHERE project_id = ? AND title = ?')
    .get(project.id, structure.epic.title) as any
  if (existingEpic) {
    return { created: false, message: `Epic "${structure.epic.title}" already exists — skipped` }
  }

  // Create epic
  const epicId = randomUUID()
  const epicShortId = nextShortId(db, project.id, 'epic')
  db.prepare('INSERT INTO epics (id, project_id, title, description, short_id) VALUES (?, ?, ?, ?, ?)')
    .run(epicId, project.id, structure.epic.title, structure.epic.description || null, epicShortId)
  const epic = db.prepare('SELECT * FROM epics WHERE id = ?').get(epicId)
  broadcast({ type: 'epic.created', data: epic })

  let totalStories = 0

  for (const feat of structure.features) {
    // Idempotency for feature
    const existingFeat = db.prepare('SELECT * FROM features WHERE epic_id = ? AND title = ?')
      .get(epicId, feat.title) as any
    const featId = existingFeat?.id ?? randomUUID()

    if (!existingFeat) {
      const featShortId = nextShortId(db, project.id, 'feature')
      db.prepare('INSERT INTO features (id, epic_id, title, description, short_id, tags) VALUES (?, ?, ?, ?, ?, ?)')
        .run(featId, epicId, feat.title, feat.description || null, featShortId, '[]')
      const feature = db.prepare('SELECT * FROM features WHERE id = ?').get(featId)
      broadcast({ type: 'feature.created', data: feature })
    }

    for (const story of feat.stories) {
      const existingStory = db.prepare('SELECT * FROM stories WHERE feature_id = ? AND title = ?')
        .get(featId, story.title) as any
      if (existingStory) continue

      const storyId = randomUUID()
      const storyShortId = nextShortId(db, project.id, 'story')
      const acJson = JSON.stringify(story.acceptance_criteria)
      db.prepare(`INSERT INTO stories
        (id, feature_id, title, description, priority, status, short_id, tags, acceptance_criteria)
        VALUES (?, ?, ?, ?, ?, 'backlog', ?, '[]', ?)`)
        .run(storyId, featId, story.title, story.description || null, story.priority, storyShortId, acJson)
      const newStory = db.prepare('SELECT * FROM stories WHERE id = ?').get(storyId)
      broadcast({ type: 'story.created', data: newStory })
      totalStories++
    }
  }

  const msg = `Synced: Epic "${structure.epic.title}", ${structure.features.length} features, ${totalStories} stories`
  console.log('[doc-sync]', msg)
  return { created: true, message: msg }
}
