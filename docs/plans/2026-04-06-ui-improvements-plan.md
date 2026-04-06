---
project: BOARD
type: implementation-plan
---

# UI Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add backlog filtering + feature rows, agent skill source field with read-only superpowers display, AI reformat button in creation forms, and `start_story` skill injection.

**Architecture:** Four independent areas — (1) backlog UI enhancements, (2) agent skill data model + UI split, (3) new backend AI endpoint + modal button, (4) MCP tool enrichment. All changes are additive or backwards-compatible.

**Tech Stack:** React 19, TypeScript, TanStack Query, Tailwind CSS (client); Express, postgres.js, Anthropic SDK (server); MCP SDK (mcp)

---

## Task 1: Fix seed — stop overwriting manually-added skills on restart

**Problem:** The seed does `ON CONFLICT (slug) DO UPDATE SET ... skills = EXCLUDED.skills`, wiping any manually-added skills on every server restart.

**Files:**
- Modify: `server/src/db/seed.ts`

**Step 1: Change ON CONFLICT to not touch skills**

In `seed.ts`, change the agent upsert (around line 119–130) from:

```typescript
await sql`
  INSERT INTO agents (id, slug, name, scope, color, avatar_emoji, skills)
  VALUES (${randomUUID()}, ${a.slug}, ${a.name}, ${a.scope ?? null}, ${a.color}, ${a.avatar_emoji}, ${sql.json(a.skills)})
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    scope = EXCLUDED.scope,
    color = EXCLUDED.color,
    avatar_emoji = EXCLUDED.avatar_emoji,
    skills = EXCLUDED.skills
`
```

To:

```typescript
await sql`
  INSERT INTO agents (id, slug, name, scope, color, avatar_emoji, skills)
  VALUES (${randomUUID()}, ${a.slug}, ${a.name}, ${a.scope ?? null}, ${a.color}, ${a.avatar_emoji}, ${sql.json(a.skills)})
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    scope = EXCLUDED.scope,
    color = EXCLUDED.color,
    avatar_emoji = EXCLUDED.avatar_emoji
`
```

**Step 2: Add Migration 3 — additive superpowers skill sync**

After Migration 2, add Migration 3 that ensures each agent has all their expected superpowers skills, without removing manual ones. Add this after line 155 of `seed.ts`:

```typescript
// Migration 3: add missing superpowers skills (additive — never removes manual skills)
const allAgents3 = await sql`SELECT id, slug, skills FROM agents`
for (const agent of allAgents3) {
  const agentDef = AGENTS.find(a => a.slug === agent.slug)
  if (!agentDef) continue
  const currentSkills = (agent.skills ?? []) as { name: string; content: string; source?: string }[]
  const currentNames = new Set(currentSkills.map(s => s.name))
  const missing = agentDef.skills.filter(s => !currentNames.has(s.name))
  if (missing.length === 0) continue
  // Fill content for missing superpowers skills
  const filledMissing = missing.map(s => {
    if (s.name.startsWith('superpowers:')) {
      const skillName = s.name.replace('superpowers:', '')
      const content = readSuperpowersSkill(skillName)
      return { name: s.name, content, source: 'superpowers' as const }
    }
    return { name: s.name, content: s.content, source: 'manual' as const }
  })
  await sql`UPDATE agents SET skills = ${sql.json([...currentSkills, ...filledMissing])} WHERE id = ${agent.id}`
}
```

**Step 3: Add Migration 4 — add source field to existing skills**

```typescript
// Migration 4: add source field to skills that don't have it
const allAgents4 = await sql`SELECT id, skills FROM agents`
for (const agent of allAgents4) {
  const skills = (agent.skills ?? []) as { name: string; content: string; source?: string }[]
  const needsMigration = skills.some(s => s.source === undefined)
  if (!needsMigration) continue
  const updated = skills.map(s => ({
    ...s,
    source: s.source ?? (s.name.startsWith('superpowers:') ? 'superpowers' : 'manual'),
  }))
  await sql`UPDATE agents SET skills = ${sql.json(updated)} WHERE id = ${agent.id}`
}
```

**Step 4: Start server and verify no errors**

```bash
npm run dev:server --workspace=server
```

Expected: server starts, migrations run without errors.

**Step 5: Commit**

```bash
git add server/src/db/seed.ts
git commit -m "fix: preserve manual skills on restart, add source field migration"
```

---

## Task 2: Add `source` field to AgentSkill type + api.ts AI call

**Files:**
- Modify: `client/src/lib/api.ts`

**Step 1: Update AgentSkill interface and add ai.reformat**

In `api.ts`, change line 70:

```typescript
// Before
export interface AgentSkill { name: string; content: string }

// After
export interface AgentSkill { name: string; content: string; source?: 'superpowers' | 'manual' }
```

Then add an `ai` entry to the `api` object after the `events` block:

```typescript
  ai: {
    reformat: (data: { type: 'epic' | 'feature' | 'story'; title: string; description: string }) =>
      request<{ title: string; description: string }>('/ai/reformat', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
```

**Step 2: Verify TypeScript compiles**

```bash
npm run lint --workspace=client
```

Expected: no type errors.

**Step 3: Commit**

```bash
git add client/src/lib/api.ts
git commit -m "feat: add source field to AgentSkill type, add ai.reformat api call"
```

---

## Task 3: Update AgentProfileView — superpowers read-only, manual editable

**Files:**
- Modify: `client/src/views/AgentProfileView.tsx`

**Step 1: Import MarkdownContent**

Add to the imports at the top:

```typescript
import { MarkdownContent } from '@/components/MarkdownContent'
```

**Step 2: Replace the skill rendering block**

Find the skills map block (lines 129–189). Replace the expanded content section:

```tsx
{/* Expanded content — read-only for superpowers, editable for manual */}
{isExpanded && (
  <div className="px-3 py-2 border-t border-slate-200">
    {skill.source === 'superpowers' ? (
      <div className="prose prose-sm max-w-none text-xs text-slate-600 py-1">
        <MarkdownContent>{skill.content || '*No content loaded.*'}</MarkdownContent>
      </div>
    ) : (
      <>
        <textarea
          value={skill.content}
          onChange={e => {
            const updated = skills.map((s, i) => i === idx ? { ...s, content: e.target.value } : s)
            queryClient.setQueryData(['agent', agentSlug], { ...typedAgent, skills: updated })
          }}
          onBlur={e => updateSkillContent(idx, e.target.value)}
          rows={10}
          placeholder="Paste skill content here…"
          className="w-full text-xs text-slate-600 font-mono border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-y"
        />
        <p className="text-[10px] text-slate-300 mt-1">Changes save on blur</p>
      </>
    )}
  </div>
)}
```

**Step 3: Hide rename + delete for superpowers skills**

In the skill header row, wrap the name span and delete button with source checks:

```tsx
{/* Skill name — not editable for superpowers */}
{skill.source === 'superpowers' ? (
  <span className="flex-1 text-sm font-medium text-slate-700 truncate">
    {skill.name}
  </span>
) : isEditingName ? (
  <input
    autoFocus
    value={skill.name}
    onChange={e => {
      const updated = skills.map((s, i) => i === idx ? { ...s, name: e.target.value } : s)
      queryClient.setQueryData(['agent', agentSlug], { ...typedAgent, skills: updated })
    }}
    onBlur={e => { updateSkillName(idx, e.target.value); setEditingNameIdx(null) }}
    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    className="flex-1 text-sm font-medium text-slate-700 bg-white border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
  />
) : (
  <span
    onClick={() => setEditingNameIdx(idx)}
    className="flex-1 text-sm font-medium text-slate-700 cursor-text hover:text-blue-700 truncate"
    title="Click to rename"
  >
    {skill.name}
  </span>
)}

{/* Delete — only for manual skills */}
{skill.source !== 'superpowers' && (
  <button
    onClick={() => deleteSkill(idx)}
    className="text-slate-300 hover:text-red-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
  >
    <X size={13} />
  </button>
)}
```

**Step 4: Set source: 'manual' when adding a skill**

In the `addSkill` function (line 82), change:

```typescript
// Before
saveSkills([...skills, { name: newSkillName.trim(), content: newSkillContent }])

// After
saveSkills([...skills, { name: newSkillName.trim(), content: newSkillContent, source: 'manual' as const }])
```

**Step 5: Visual check**

Navigate to any agent profile page. Superpowers skills should expand to show rendered markdown (read-only). Manual skills should expand to show the editable textarea. Delete buttons only appear on manual skills.

**Step 6: Commit**

```bash
git add client/src/views/AgentProfileView.tsx
git commit -m "feat: render superpowers skills read-only, manual skills editable"
```

---

## Task 4: Update FilterBar — add itemType + featureId filters

**Files:**
- Modify: `client/src/components/FilterBar.tsx`

**Step 1: Add new filter fields to the Filters type**

```typescript
export interface Filters {
  assignees: string[]
  tags: string[]
  priorities: string[]
  epicId: string
  featureId: string    // new
  itemType: 'all' | 'stories' | 'features'  // new
  search: string
}

export const defaultFilters: Filters = {
  assignees: [],
  tags: [],
  priorities: [],
  epicId: '',
  featureId: '',       // new
  itemType: 'all',     // new
  search: '',
}
```

**Step 2: Add Feature to Props and render new filter controls**

Update the Props interface:

```typescript
import type { Agent, Epic, Feature } from '@/lib/api'

interface Props {
  agents: Agent[]
  epics: Epic[]
  features: Feature[]   // new
  filters: Filters
  onChange: (f: Filters) => void
}
```

Add item-type toggle chips after the priority chips, and a feature dropdown after the epic dropdown:

```tsx
{/* Item type toggle */}
<div className="flex items-center gap-1">
  {(['all', 'stories', 'features'] as const).map(t => (
    <button
      key={t}
      onClick={() => onChange({ ...filters, itemType: t })}
      className={`h-6 px-2 text-xs rounded-full border capitalize transition-colors ${
        filters.itemType === t
          ? 'bg-slate-800 border-slate-800 text-white'
          : 'border-slate-200 text-slate-500 hover:border-slate-400'
      }`}
    >
      {t}
    </button>
  ))}
</div>

{/* Feature filter — shown when not in "features only" mode */}
{filters.itemType !== 'features' && features.length > 0 && (
  <select
    value={filters.featureId}
    onChange={e => onChange({ ...filters, featureId: e.target.value })}
    className={selectCls}
  >
    <option value="">Feature</option>
    {features.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
  </select>
)}
```

**Step 3: Update the hasFilters check**

```typescript
const hasFilters = filters.assignees.length > 0 || filters.priorities.length > 0 || filters.tags.length > 0
  || filters.epicId || filters.featureId || filters.search || filters.itemType !== 'all'
```

**Step 4: Commit**

```bash
git add client/src/components/FilterBar.tsx
git commit -m "feat: add itemType and featureId filters to FilterBar"
```

---

## Task 5: Update BacklogView — unified list with features + clickable badges

**Files:**
- Modify: `client/src/views/BacklogView.tsx`
- Modify: `client/src/App.tsx` (pass projectKey to BacklogView)

**Step 1: Pass projectKey to BacklogView**

In `App.tsx`, find:
```tsx
if (view === 'backlog') return <BacklogView projectId={project.id} />
```
Change to:
```tsx
if (view === 'backlog') return <BacklogView projectId={project.id} projectKey={project.key} />
```

**Step 2: Rewrite BacklogView**

Replace the full contents of `BacklogView.tsx`:

```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Story, Agent, Epic, Feature } from '@/lib/api'
import { FilterBar, defaultFilters } from '@/components/FilterBar'
import type { Filters } from '@/components/FilterBar'
import { featureColor } from '@/lib/featureColor'
import { StoryPanel } from '@/components/StoryPanel'

interface Props { projectId: string; projectKey: string }

export function BacklogView({ projectId, projectKey }: Props) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<Filters>(defaultFilters)

  const selectedIssue = searchParams.get('selectedIssue')

  const { data: stories = [] } = useQuery({
    queryKey: ['stories', projectId],
    queryFn: () => api.stories.list(projectId),
    enabled: !!projectId,
  })
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: api.agents.list })
  const { data: epics = [] } = useQuery({
    queryKey: ['epics', projectId],
    queryFn: () => api.epics.list(projectId),
    enabled: !!projectId,
  })
  const { data: features = [] } = useQuery({
    queryKey: ['features'],
    queryFn: () => api.features.listAll(),
  })

  const typedAgents = agents as Agent[]
  const typedFeatures = features as Feature[]
  const typedEpics = epics as Epic[]
  const agentMap = Object.fromEntries(typedAgents.map(a => [a.id, a]))
  const featureMap = Object.fromEntries(typedFeatures.map(f => [f.id, f]))
  const epicMap = Object.fromEntries(typedEpics.map(e => [e.id, e]))

  // Features for this project (via epic)
  const epicIds = new Set(typedEpics.map(e => e.id))
  const projectFeatures = typedFeatures.filter(f => epicIds.has(f.epic_id))

  // Stories
  let backlogStories = (stories as Story[]).filter(s => s.status === 'backlog')
  if (filters.epicId) backlogStories = backlogStories.filter(s => featureMap[s.feature_id]?.epic_id === filters.epicId)
  if (filters.featureId) backlogStories = backlogStories.filter(s => s.feature_id === filters.featureId)
  if (filters.assignees.length > 0) backlogStories = backlogStories.filter(s => s.assigned_agent_id && filters.assignees.includes(s.assigned_agent_id))
  if (filters.priorities.length > 0) backlogStories = backlogStories.filter(s => filters.priorities.includes(s.priority))
  if (filters.search) {
    const q = filters.search.toLowerCase()
    backlogStories = backlogStories.filter(s =>
      s.title.toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q) ||
      (s.short_id ?? '').toLowerCase().includes(q)
    )
  }

  // Features to show (apply epic filter if set)
  let visibleFeatures = projectFeatures
  if (filters.epicId) visibleFeatures = visibleFeatures.filter(f => f.epic_id === filters.epicId)
  if (filters.search) {
    const q = filters.search.toLowerCase()
    visibleFeatures = visibleFeatures.filter(f =>
      f.title.toLowerCase().includes(q) ||
      (f.description ?? '').toLowerCase().includes(q) ||
      (f.short_id ?? '').toLowerCase().includes(q)
    )
  }

  function selectStory(s: Story) {
    const key = s.short_id ?? s.id
    if (selectedIssue === key) setSearchParams({})
    else setSearchParams({ selectedIssue: key })
  }

  const showStories = filters.itemType !== 'features'
  const showFeatures = filters.itemType !== 'stories'
  const totalCount = (showStories ? backlogStories.length : 0) + (showFeatures ? visibleFeatures.length : 0)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <span className="text-sm font-medium text-slate-600 flex-shrink-0">Backlog</span>
        <FilterBar
          agents={typedAgents}
          epics={typedEpics}
          features={projectFeatures}
          filters={filters}
          onChange={setFilters}
        />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-1">
            <p className="text-xs text-slate-400 mb-3">{totalCount} items</p>

            {/* Feature rows */}
            {showFeatures && visibleFeatures.map(f => {
              const epicColors = featureColor(f.epic_id)
              const featureColors = featureColor(f.id)
              const epic = epicMap[f.epic_id]
              return (
                <div
                  key={`feature-${f.id}`}
                  onClick={() => navigate(`/${projectKey}/features/${f.short_id ?? f.id}`)}
                  className={`flex items-center gap-3 p-3 bg-white border rounded-lg cursor-pointer text-sm group border-l-4 transition-colors hover:border-slate-300 ${featureColors.border}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {f.short_id && (
                        <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">{f.short_id}</span>
                      )}
                      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide flex-shrink-0">Feature</span>
                      <span className="text-slate-800 font-medium truncate group-hover:text-blue-600">
                        {f.title}
                      </span>
                    </div>
                    {epic && (
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          navigate(`/${projectKey}/epics/${epic.short_id ?? epic.id}`)
                        }}
                        className={`inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${epicColors.bg} ${epicColors.text} truncate max-w-[200px] hover:opacity-80 transition-opacity`}
                      >
                        {epic.short_id} {epic.title.length > 24 ? epic.title.slice(0, 24) + '…' : epic.title}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Story rows */}
            {showStories && backlogStories.map(s => {
              const agent = s.assigned_agent_id ? agentMap[s.assigned_agent_id] : null
              const feature = featureMap[s.feature_id]
              const colors = feature ? featureColor(feature.id) : null
              const isSelected = selectedIssue === (s.short_id ?? s.id)

              return (
                <div
                  key={s.id}
                  onClick={() => selectStory(s)}
                  className={`flex items-center gap-3 p-3 bg-white border rounded-lg cursor-pointer text-sm group border-l-4 transition-colors ${
                    colors?.border ?? 'border-l-slate-200'
                  } ${isSelected ? 'border-slate-300 bg-blue-50/40' : 'hover:border-slate-300'}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {s.short_id && (
                        <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">{s.short_id}</span>
                      )}
                      <span className={`text-slate-800 font-medium truncate ${isSelected ? 'text-blue-700' : 'group-hover:text-blue-600'}`}>
                        {s.title}
                      </span>
                    </div>
                    {feature && colors && (
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          navigate(`/${projectKey}/features/${feature.short_id ?? feature.id}`)
                        }}
                        className={`inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} truncate max-w-[200px] hover:opacity-80 transition-opacity`}
                      >
                        {feature.short_id} {feature.title.length > 24 ? feature.title.slice(0, 24) + '…' : feature.title}
                      </button>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border capitalize flex-shrink-0 ${
                    s.priority === 'high' ? 'border-red-200 text-red-600' :
                    s.priority === 'medium' ? 'border-amber-200 text-amber-600' :
                    'border-slate-200 text-slate-400'
                  }`}>{s.priority}</span>
                  {agent && (
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/team/${agent.slug}`) }}
                      title={`Go to ${agent.name}'s profile`}
                      className="flex-shrink-0 hover:opacity-70 transition-opacity"
                    >
                      {agent.avatar_emoji}
                    </button>
                  )}
                </div>
              )
            })}

            {totalCount === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">Nothing here.</p>
            )}
          </div>
        </div>

        {selectedIssue && (
          <StoryPanel
            storyId={selectedIssue}
            onClose={() => setSearchParams({})}
          />
        )}
      </div>
    </div>
  )
}
```

**Step 3: Verify TypeScript compiles**

```bash
npm run lint --workspace=client
```

Expected: no errors.

**Step 4: Commit**

```bash
git add client/src/views/BacklogView.tsx client/src/App.tsx
git commit -m "feat: unified backlog list with features, item type filter, clickable badges"
```

---

## Task 6: Add epic badge to FeatureDetailView header

**Files:**
- Modify: `client/src/views/FeatureDetailView.tsx`

**Step 1: Import featureColor**

Add to imports:
```typescript
import { featureColor } from '@/lib/featureColor'
```

**Step 2: Add the epic badge in the header**

Find the breadcrumb section (lines 61–70):

```tsx
<div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
  {typedEpic && (
    <button
      onClick={() => navigate(`/${projectKey}/epics/${typedEpic.short_id ?? typedEpic.id}`)}
      className="font-medium text-slate-500 hover:text-blue-600"
    >
      {typedEpic.title}
    </button>
  )}
  {typedEpic && <span>›</span>}
  <span>Feature</span>
</div>
```

Replace with:

```tsx
<div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
  {typedEpic && (() => {
    const epicColors = featureColor(typedEpic.id)
    return (
      <button
        onClick={() => navigate(`/${projectKey}/epics/${typedEpic.short_id ?? typedEpic.id}`)}
        className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded ${epicColors.bg} ${epicColors.text} hover:opacity-80 transition-opacity`}
      >
        {typedEpic.short_id} {typedEpic.title.length > 32 ? typedEpic.title.slice(0, 32) + '…' : typedEpic.title}
      </button>
    )
  })()}
  {typedEpic && <span>›</span>}
  <span>Feature</span>
</div>
```

**Step 3: Commit**

```bash
git add client/src/views/FeatureDetailView.tsx
git commit -m "feat: add colored epic badge to feature detail header"
```

---

## Task 7: Backend AI reformat endpoint

**Files:**
- Run: `npm install @anthropic-ai/sdk --workspace=server`
- Create: `server/src/routes/ai.ts`
- Modify: `server/src/routes/index.ts`

**Step 1: Install the Anthropic SDK**

```bash
cd agent-board && npm install @anthropic-ai/sdk --workspace=server
```

Expected: package installed, `server/package.json` updated.

**Step 2: Create `server/src/routes/ai.ts`**

```typescript
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

      const raw = (message.content[0] as { type: string; text: string }).text.trim()
      // Strip markdown code fences if present
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
```

**Step 3: Mount the router in `server/src/routes/index.ts`**

Add the import:
```typescript
import { aiRouter } from './ai.js'
```

Add in `createRouter`:
```typescript
router.use('/ai', aiRouter())
```

**Step 4: Start server and test manually**

```bash
# Set env var temporarily to test
ANTHROPIC_API_KEY=sk-ant-... npm run dev:server --workspace=server
```

Then with curl or a REST client:
```bash
curl -X POST http://localhost:3000/api/ai/reformat \
  -H "Content-Type: application/json" \
  -d '{"type":"story","title":"user can log in","description":"add login with google"}'
```

Expected: `{"title":"...","description":"## User Story\nAs a..."}`

**Step 5: Test 501 when no API key**

Start server without `ANTHROPIC_API_KEY`. POST to `/api/ai/reformat` should return `501`.

**Step 6: Commit**

```bash
git add server/src/routes/ai.ts server/src/routes/index.ts server/package.json server/package-lock.json
git commit -m "feat: add POST /api/ai/reformat endpoint using claude-haiku"
```

---

## Task 8: Add AI Format button to CreateModal

**Files:**
- Modify: `client/src/components/CreateModal.tsx`

**Step 1: Add state + handler**

Add after the existing state declarations (line ~103):

```typescript
const [isFormatting, setIsFormatting] = useState(false)
const [formatError, setFormatError] = useState('')
const [aiAvailable, setAiAvailable] = useState<boolean | null>(null)

// Check if AI is available on mount
useEffect(() => {
  api.ai.reformat({ type: 'story', title: '', description: '' })
    .then(() => setAiAvailable(true))
    .catch((e: Error) => {
      if (e.message.includes('501')) setAiAvailable(false)
      else setAiAvailable(true) // available but errored for other reason
    })
}, [])

async function handleFormat() {
  setIsFormatting(true)
  setFormatError('')
  try {
    const result = await api.ai.reformat({ type, title, description })
    setTitle(result.title)
    setDescription(result.description)
  } catch (e) {
    setFormatError('Format failed — try again')
  } finally {
    setIsFormatting(false)
  }
}
```

Add `useEffect` to imports: `import { useState, useEffect } from 'react'`

**Step 2: Remove template pre-filling**

Change line 97:
```typescript
// Before
const [description, setDescription] = useState(TEMPLATES.story)

// After
const [description, setDescription] = useState('')
```

Change the type switch handler (line ~192):
```typescript
// Before
onClick={() => { setType(t); setDescription(TEMPLATES[t]); setError('') }}

// After
onClick={() => { setType(t); setDescription(''); setError('') }}
```

Remove the `placeholder` prop from the title input (line ~261):
```typescript
// Remove: placeholder={`${type.charAt(0).toUpperCase() + type.slice(1)} title…`}
```

**Step 3: Add Format button above the description textarea**

Replace the description label line:

```tsx
<div>
  <div className="flex items-center justify-between mb-1">
    <label className="text-xs font-medium text-slate-600">Description</label>
    {aiAvailable && (
      <button
        type="button"
        onClick={handleFormat}
        disabled={isFormatting}
        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-40"
      >
        {isFormatting ? (
          <span className="animate-pulse">Formatting…</span>
        ) : (
          <>✦ Format</>
        )}
      </button>
    )}
  </div>
  <textarea
    value={description}
    onChange={e => setDescription(e.target.value)}
    rows={12}
    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono"
  />
  {formatError && <p className="text-xs text-red-500 mt-1">{formatError}</p>}
</div>
```

**Step 4: Verify TypeScript compiles**

```bash
npm run lint --workspace=client
```

**Step 5: Visual check**

Open the Create modal. Description should start empty. If `ANTHROPIC_API_KEY` is set on the server, the "✦ Format" button appears next to the Description label. Clicking it should populate title and description.

**Step 6: Commit**

```bash
git add client/src/components/CreateModal.tsx
git commit -m "feat: add AI format button to create modal, remove pre-filled templates"
```

---

## Task 9: Enrich start_story MCP response with agent skills

**Files:**
- Modify: `mcp/src/index.ts`
- Modify: `mcp/src/tools/board.ts` (add getAgent method)

**Step 1: Add `getAgent` to the board client**

In `mcp/src/tools/board.ts`, find the `listAgents` function and add after it:

```typescript
async getAgent(slug: string): Promise<any> {
  const res = await fetch(`${this.baseUrl}/api/agents/${slug}`, {
    headers: this.headers,
  })
  if (!res.ok) return null
  return res.json()
}
```

**Step 2: Enrich start_story in `mcp/src/index.ts`**

Replace the `start_story` tool (lines 210–218):

```typescript
server.tool(
  'start_story',
  'Assign a story to an agent and move it to In Progress. Returns story details + your skill definitions.',
  { story_id: z.string(), agent_id: z.string().describe('Agent slug, e.g. tess-ter') },
  async ({ story_id, agent_id }) => {
    const story = await board.moveStatus(story_id, 'in_progress', agent_id, 'Started work')
    
    let skillsSection = ''
    try {
      const agent = await board.getAgent(agent_id)
      const skills = (agent?.skills ?? []) as { name: string; content: string; source?: string }[]
      const withContent = skills.filter(s => s.content?.trim())
      if (withContent.length > 0) {
        skillsSection = '\n\n---\n## Your Skills\n\n' + withContent.map(s =>
          `### ${s.name}\n\n${s.content}`
        ).join('\n\n---\n\n')
      }
    } catch {
      // graceful degradation — story response still returned
    }

    return {
      content: [{
        type: 'text' as const,
        text: `${story.short_id ?? story.id} "${story.title}" → In Progress (${agent_id})${skillsSection}`
      }]
    }
  }
)
```

**Step 3: Rebuild MCP**

```bash
npm run build --workspace=mcp
```

Expected: `mcp/dist/index.js` updated, no TypeScript errors.

**Step 4: Test via MCP**

In a Claude Code session with the board MCP configured, call:
```
start_story("BOARD-42", "tess-ter")
```

Expected response should include `## Your Skills` followed by the agent's skill markdown content.

**Step 5: Commit**

```bash
git add mcp/src/index.ts mcp/src/tools/board.ts mcp/dist/index.js
git commit -m "feat: start_story now returns agent skills in response"
```

---

## Task 10: Update CLAUDE.md with ANTHROPIC_API_KEY env var

**Files:**
- Modify: `CLAUDE.md`

Add to the Environment Variables table:

```markdown
| `ANTHROPIC_API_KEY` | — | Anthropic API key for AI reformat feature in CreateModal. If not set, the Format button is hidden. |
```

**Commit:**

```bash
git add CLAUDE.md
git commit -m "docs: document ANTHROPIC_API_KEY env var"
```
