import { Router } from 'express'
import { randomUUID } from 'crypto'
import type { Sql } from '../db/index.js'
import { Broadcast } from '../ws/index.js'

export function storyLinksRouter(sql: Sql, broadcast: Broadcast): Router {
  const router = Router({ mergeParams: true })

  router.get('/', async (req, res) => {
    const params = req.params as Record<string, string>
    const [story] = await sql`SELECT id FROM stories WHERE id = ${params.id} OR short_id = ${params.id}`
    if (!story) return res.status(404).json({ error: 'Not found' })
    const links = await sql`
      SELECT * FROM story_links WHERE from_story_id = ${story.id} OR to_story_id = ${story.id} ORDER BY created_at
    `
    res.json(links)
  })

  router.post('/', async (req, res) => {
    const params = req.params as Record<string, string>
    const { to_story_id, link_type } = req.body
    if (!to_story_id || !link_type) return res.status(400).json({ error: 'to_story_id and link_type required' })
    const validTypes = ['blocks', 'duplicates', 'relates_to']
    if (!validTypes.includes(link_type)) return res.status(400).json({ error: `link_type must be one of: ${validTypes.join(', ')}` })
    const [story] = await sql`SELECT id FROM stories WHERE id = ${params.id} OR short_id = ${params.id}`
    if (!story) return res.status(404).json({ error: 'Story not found' })
    const [toStory] = await sql`SELECT id FROM stories WHERE id = ${to_story_id} OR short_id = ${to_story_id}`
    if (!toStory) return res.status(404).json({ error: 'Target story not found' })
    const id = randomUUID()
    try {
      await sql`INSERT INTO story_links (id, from_story_id, to_story_id, link_type) VALUES (${id}, ${story.id}, ${toStory.id}, ${link_type})`
    } catch (e: any) {
      if (e.code === '23505') return res.status(409).json({ error: 'Link already exists' })
      throw e
    }
    const [link] = await sql`SELECT * FROM story_links WHERE id = ${id}`
    broadcast({ type: 'story_link.created', data: link })
    res.status(201).json(link)
  })

  router.delete('/:linkId', async (req, res) => {
    const params = req.params as Record<string, string>
    const [story] = await sql`SELECT id FROM stories WHERE id = ${params.id} OR short_id = ${params.id}`
    if (!story) return res.status(404).json({ error: 'Story not found' })
    const [link] = await sql`
      SELECT * FROM story_links WHERE id = ${params.linkId} AND (from_story_id = ${story.id} OR to_story_id = ${story.id})
    `
    if (!link) return res.status(404).json({ error: 'Not found' })
    await sql`DELETE FROM story_links WHERE id = ${params.linkId}`
    broadcast({ type: 'story_link.deleted', data: { id: params.linkId, from_story_id: link.from_story_id, to_story_id: link.to_story_id } })
    res.status(204).send()
  })

  return router
}
