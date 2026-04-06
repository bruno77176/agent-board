import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'

const TEMPLATES: Record<string, string> = {
  epic: `## Context
[Describe the current situation / problem being solved]

## Objective
[What are we trying to achieve?]

## Value
[Why does it matter? Business impact]

---

## Scope

**In scope:**
-

**Out of scope:**
-

---

## Success Criteria
- [Metric 1]
- [Metric 2]
- [Metric 3]

---

## Stakeholders
- Product:
- Tech:
- Business:`,

  feature: `## Description
This feature enables: [what it unlocks functionally]

---

## User Value
[Who benefits and how?]

---

## High-Level Acceptance Criteria
- [End-to-end functionality works]
- [Handles key edge cases]
- [Integrated with relevant systems]

---

## Dependencies
- [System / team / API]

---

## Risks / Assumptions
-`,

  story: `## User Story
As a [user/system]
I want [capability]
So that [value]

---

## Acceptance Criteria

### Scenario 1
- Given [context]
- When [action]
- Then [expected result]

---

## Definition of Done
- [ ] Code implemented
- [ ] Tests added (unit / e2e)
- [ ] Code reviewed
- [ ] Deployed / usable`,
}

export function aiRouter(): Router {
  const router = Router()

  router.get('/status', (_req, res) => {
    res.json({ available: !!process.env.ANTHROPIC_API_KEY })
  })

  router.post('/reformat', async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return res.status(501).json({ error: 'AI reformatting not configured (ANTHROPIC_API_KEY not set)' })
    }

    const { type, title, description } = req.body as { type: string; title: string; description: string }
    if (!type || !['epic', 'feature', 'story'].includes(type)) {
      return res.status(400).json({ error: 'type must be epic, feature, or story' })
    }

    const client = new Anthropic({ apiKey })
    const template = TEMPLATES[type]

    const prompt = `You are helping format a ${type} for a software project management board.

The user has written:
Title: ${title || '(no title yet)'}
Description:
${description || '(no description yet)'}

Reformat this into a clean, professional ${type} using EXACTLY this template structure:
${template}

Rules:
- Keep the user's intent and content — don't invent details they didn't provide
- Fill in the template sections based on what the user wrote
- If a section has no relevant content, use a brief placeholder like "TBD"
- Return a JSON object with exactly two keys: "title" (a concise, clear title string) and "description" (the formatted markdown string)
- Do not include any other text, just the JSON object`

    try {
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })

      const block = message.content[0]
      if (!block || block.type !== 'text') throw new Error('Unexpected response shape')
      const raw = block.text.trim()
      const jsonStr = raw.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '')
      const parsed = JSON.parse(jsonStr) as { title: string; description: string }

      if (typeof parsed.title !== 'string' || typeof parsed.description !== 'string') {
        throw new Error('Unexpected response shape')
      }

      res.json({ title: parsed.title, description: parsed.description })
    } catch (err) {
      console.error('AI reformat error:', err)
      res.status(500).json({ error: 'Failed to reformat — try again' })
    }
  })

  return router
}
