import { Router } from 'express'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { Broadcast } from '../ws/index.js'

export function storyLinksRouter(db: Database.Database, broadcast: Broadcast): Router {
  const router = Router({ mergeParams: true })

  router.get('/', (req, res) => {
    const params = req.params as Record<string, string>
    const story = db.prepare('SELECT id FROM stories WHERE id = ? OR short_id = ?').get(params.id, params.id) as any
    if (!story) return res.status(404).json({ error: 'Not found' })
    const links = db.prepare(
      'SELECT * FROM story_links WHERE from_story_id = ? OR to_story_id = ? ORDER BY created_at'
    ).all(story.id, story.id)
    res.json(links)
  })

  router.post('/', (req, res) => {
    const params = req.params as Record<string, string>
    const { to_story_id, link_type } = req.body
    if (!to_story_id || !link_type) return res.status(400).json({ error: 'to_story_id and link_type required' })
    const validTypes = ['blocks', 'duplicates', 'relates_to']
    if (!validTypes.includes(link_type)) return res.status(400).json({ error: `link_type must be one of: ${validTypes.join(', ')}` })
    const story = db.prepare('SELECT id FROM stories WHERE id = ? OR short_id = ?').get(params.id, params.id) as any
    if (!story) return res.status(404).json({ error: 'Story not found' })
    const toStory = db.prepare('SELECT id FROM stories WHERE id = ? OR short_id = ?').get(to_story_id, to_story_id) as any
    if (!toStory) return res.status(404).json({ error: 'Target story not found' })
    const id = randomUUID()
    try {
      db.prepare('INSERT INTO story_links (id, from_story_id, to_story_id, link_type) VALUES (?, ?, ?, ?)')
        .run(id, story.id, toStory.id, link_type)
    } catch (e: any) {
      if (e.message?.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'Link already exists' })
      }
      throw e
    }
    const link = db.prepare('SELECT * FROM story_links WHERE id = ?').get(id)
    broadcast({ type: 'story_link.created', data: link })
    res.status(201).json(link)
  })

  router.delete('/:linkId', (req, res) => {
    const params = req.params as Record<string, string>
    const story = db.prepare('SELECT id FROM stories WHERE id = ? OR short_id = ?').get(params.id, params.id) as any
    if (!story) return res.status(404).json({ error: 'Story not found' })
    const link = db.prepare('SELECT * FROM story_links WHERE id = ? AND (from_story_id = ? OR to_story_id = ?)').get(params.linkId, story.id, story.id) as any
    if (!link) return res.status(404).json({ error: 'Not found' })
    db.prepare('DELETE FROM story_links WHERE id = ?').run(params.linkId)
    broadcast({ type: 'story_link.deleted', data: { id: params.linkId, from_story_id: link.from_story_id, to_story_id: link.to_story_id } })
    res.status(204).send()
  })

  return router
}
