import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Story, Agent, Epic } from '@/lib/api'
import { FilterBar, defaultFilters } from '@/components/FilterBar'
import type { Filters } from '@/components/FilterBar'
import { featureColor } from '@/lib/featureColor'
import { StoryPanel } from '@/components/StoryPanel'

interface Props { projectId: string }

export function BacklogView({ projectId }: Props) {
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
