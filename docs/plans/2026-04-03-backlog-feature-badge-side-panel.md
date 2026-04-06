---
project: BOARD
type: implementation-plan
---

# Backlog Feature Badge + Side Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add colored feature badges to each backlog row and a `?selectedIssue=` side panel that opens when clicking a story.

**Architecture:** Two self-contained changes to the client — (1) a color-helper + badge UI in BacklogView rows, and (2) a new `StoryPanel` component rendered beside the list when `?selectedIssue=` is present in the URL. React Router's `useSearchParams` drives the selection state so the URL is shareable.

**Tech Stack:** React 19, React Router v6 (`useSearchParams`), TanStack Query, Tailwind CSS, react-markdown (already installed), lucide-react icons.

---

### Task 1: Feature color helper

**Files:**
- Create: `client/src/lib/featureColor.ts`

A deterministic function that maps any feature ID to one of 8 consistent soft-color themes.

**Step 1: Create the file**

```ts
// client/src/lib/featureColor.ts

const PALETTE = [
  { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-l-blue-400'   },
  { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-l-purple-400' },
  { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-l-green-400'  },
  { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-l-orange-400' },
  { bg: 'bg-pink-100',   text: 'text-pink-700',   border: 'border-l-pink-400'   },
  { bg: 'bg-teal-100',   text: 'text-teal-700',   border: 'border-l-teal-400'   },
  { bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-l-amber-400'  },
  { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-l-indigo-400' },
]

/** Returns a stable color theme object for a given feature ID. */
export function featureColor(featureId: string) {
  let hash = 0
  for (let i = 0; i < featureId.length; i++) {
    hash = (hash * 31 + featureId.charCodeAt(i)) >>> 0
  }
  return PALETTE[hash % PALETTE.length]
}
```

**Step 2: Verify** — no test needed for a pure hash function; it will be visually verified when the badge renders.

---

### Task 2: StoryPanel component

**Files:**
- Create: `client/src/components/StoryPanel.tsx`

A right-side panel showing story details. Receives a `storyId` string and an `onClose` callback.

**Step 1: Create the component**

```tsx
// client/src/components/StoryPanel.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { X, ExternalLink } from 'lucide-react'
import { api } from '@/lib/api'
import type { Story, Agent } from '@/lib/api'
import { MarkdownContent } from '@/components/MarkdownContent'
import { AcceptanceCriteria } from '@/components/AcceptanceCriteria'

interface Props {
  storyId: string    // short_id or UUID
  onClose: () => void
}

export function StoryPanel({ storyId, onClose }: Props) {
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: story, isLoading } = useQuery({
    queryKey: ['story', storyId],
    queryFn: () => api.stories.get(storyId),
    enabled: !!storyId,
  })
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: api.agents.list })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Story>) => api.stories.update((story as Story).id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(['story', storyId], updated)
      queryClient.invalidateQueries({ queryKey: ['stories'] })
    },
  })

  const typedStory = story as Story | undefined
  const agentMap = Object.fromEntries((agents as Agent[]).map(a => [a.id, a]))
  const assignedAgent = typedStory?.assigned_agent_id ? agentMap[typedStory.assigned_agent_id] : null

  const statusColors: Record<string, string> = {
    backlog: 'bg-slate-100 text-slate-600',
    todo: 'bg-blue-50 text-blue-600',
    in_progress: 'bg-yellow-50 text-yellow-700',
    review: 'bg-purple-50 text-purple-700',
    qa: 'bg-orange-50 text-orange-700',
    done: 'bg-green-50 text-green-700',
    cancelled: 'bg-slate-100 text-slate-400',
  }

  return (
    <div className="w-[440px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 flex-shrink-0">
        {typedStory?.short_id && (
          <span className="text-xs font-mono text-slate-400">{typedStory.short_id}</span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => navigate(`/${projectKey}/stories/${typedStory?.short_id ?? storyId}`)}
          title="Open full page"
          className="text-slate-400 hover:text-slate-600 p-1 rounded"
        >
          <ExternalLink size={14} />
        </button>
        <button
          onClick={onClose}
          title="Close"
          className="text-slate-400 hover:text-slate-600 p-1 rounded"
        >
          <X size={14} />
        </button>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Loading…</div>
      )}

      {!isLoading && !typedStory && (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Story not found.</div>
      )}

      {typedStory && (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Title */}
          <h2 className="text-base font-semibold text-slate-900 leading-snug">{typedStory.title}</h2>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[typedStory.status] ?? 'bg-slate-100 text-slate-600'}`}>
              {typedStory.status.replace('_', ' ')}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${
              typedStory.priority === 'high' ? 'border-red-200 text-red-600' :
              typedStory.priority === 'medium' ? 'border-amber-200 text-amber-600' :
              'border-slate-200 text-slate-400'
            }`}>{typedStory.priority}</span>
            {assignedAgent && (
              <span className="text-xs text-slate-600 flex items-center gap-1">
                {assignedAgent.avatar_emoji} {assignedAgent.name}
              </span>
            )}
            {typedStory.estimated_minutes != null && (
              <span className="text-xs text-slate-400">{typedStory.estimated_minutes} min</span>
            )}
            {typedStory.tags.map(t => (
              <span key={t} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{t}</span>
            ))}
          </div>

          {/* Description */}
          {typedStory.description && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Description</p>
              <MarkdownContent>{typedStory.description}</MarkdownContent>
            </div>
          )}

          {/* Acceptance Criteria (read-only) */}
          {typedStory.acceptance_criteria && typedStory.acceptance_criteria.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Acceptance Criteria</p>
              <AcceptanceCriteria
                items={typedStory.acceptance_criteria}
                onChange={(items) => updateMutation.mutate({ acceptance_criteria: items })}
              />
            </div>
          )}

          {/* Activity */}
          {typedStory.events && typedStory.events.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Activity</p>
              <div className="space-y-2">
                {typedStory.events.slice(0, 8).map((evt: any) => {
                  const evtAgent = evt.agent_id ? agentMap[evt.agent_id] : null
                  return (
                    <div key={evt.id} className="flex gap-2 text-xs text-slate-500">
                      <span className="flex-shrink-0">{evtAgent ? evtAgent.avatar_emoji : '👤'}</span>
                      <span>
                        <span className="font-medium">{evtAgent ? evtAgent.name : 'System'}</span>
                        {evt.from_status && evt.to_status && (
                          <span className="text-slate-400"> {evt.from_status} → {evt.to_status}</span>
                        )}
                        {evt.comment && <span className="text-slate-500">: {evt.comment}</span>}
                        <span className="ml-1 text-slate-300">{new Date(evt.created_at).toLocaleDateString()}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

---

### Task 3: Update BacklogView

**Files:**
- Modify: `client/src/views/BacklogView.tsx`

Three changes:
1. Import `useSearchParams` and `featureColor`
2. Replace `navigate(...)` on row click with `setSearchParams({ selectedIssue: short_id })`
3. Add colored left border + feature badge to each row
4. Render `StoryPanel` when `selectedIssue` param is present

**Step 1: Replace the full file**

```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Story, Agent, Epic } from '@/lib/api'
import { FilterBar, defaultFilters } from '@/components/FilterBar'
import type { Filters } from '@/components/FilterBar'
import { featureColor } from '@/lib/featureColor'
import { StoryPanel } from '@/components/StoryPanel'

interface Props { projectId: string }

export function BacklogView({ projectId }: Props) {
  const { projectKey } = useParams<{ projectKey: string }>()
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
  const agentMap = Object.fromEntries(typedAgents.map(a => [a.id, a]))
  const featureToEpicId = Object.fromEntries((features as any[]).map(f => [f.id, f.epic_id]))

  let backlogStories = (stories as Story[]).filter(s => s.status === 'backlog')
  if (filters.epicId) backlogStories = backlogStories.filter(s => featureToEpicId[s.feature_id] === filters.epicId)
  if (filters.assignees.length > 0) backlogStories = backlogStories.filter(s => s.assigned_agent_id && filters.assignees.includes(s.assigned_agent_id))
  if (filters.priorities.length > 0) backlogStories = backlogStories.filter(s => filters.priorities.includes(s.priority))
  if (filters.tags.length > 0) backlogStories = backlogStories.filter(s => s.tags.some(t => filters.tags.includes(t)))
  if (filters.search) {
    const q = filters.search.toLowerCase()
    backlogStories = backlogStories.filter(s =>
      s.title.toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q) ||
      (s.short_id ?? '').toLowerCase().includes(q)
    )
  }

  function selectStory(s: Story) {
    const key = s.short_id ?? s.id
    if (selectedIssue === key) {
      setSearchParams({})
    } else {
      setSearchParams({ selectedIssue: key })
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <span className="text-sm font-medium text-slate-600 flex-shrink-0">Backlog</span>
        <FilterBar agents={typedAgents} epics={epics as Epic[]} filters={filters} onChange={setFilters} />
      </div>

      {/* Content: list + optional side panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Story list */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-1">
            <p className="text-xs text-slate-400 mb-3">{backlogStories.length} items</p>
            {backlogStories.map(s => {
              const agent = s.assigned_agent_id ? agentMap[s.assigned_agent_id] : null
              const feature = (features as any[]).find(f => f.id === s.feature_id)
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
                      <span className={`inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} truncate max-w-[200px]`}>
                        {feature.short_id} {feature.title.length > 24 ? feature.title.slice(0, 24) + '…' : feature.title}
                      </span>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border capitalize flex-shrink-0 ${
                    s.priority === 'high' ? 'border-red-200 text-red-600' :
                    s.priority === 'medium' ? 'border-amber-200 text-amber-600' :
                    'border-slate-200 text-slate-400'
                  }`}>{s.priority}</span>
                  {agent && <span title={agent.name} className="flex-shrink-0">{agent.avatar_emoji}</span>}
                </div>
              )
            })}
            {backlogStories.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">Backlog is empty.</p>
            )}
          </div>
        </div>

        {/* Side panel */}
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

**Step 2: Verify visually** — navigate to a project backlog, confirm:
- Each row has a colored left border + feature badge
- Clicking a row opens the side panel on the right
- URL updates to `?selectedIssue=BOARD-5`
- Clicking × closes the panel
- Refreshing the page with `?selectedIssue=BOARD-5` re-opens the panel
- The external-link icon navigates to the full story page
