import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Story, Agent, Epic } from '@/lib/api'
import { FilterBar, defaultFilters } from '@/components/FilterBar'
import type { Filters } from '@/components/FilterBar'

interface Props { projectId: string }

export function BacklogView({ projectId }: Props) {
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const [filters, setFilters] = useState<Filters>(defaultFilters)

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

  // Build feature_id → epic_id lookup for epic filtering
  const featureToEpicId = Object.fromEntries((features as any[]).map(f => [f.id, f.epic_id]))

  // Only backlog stories
  let backlogStories = (stories as Story[]).filter(s => s.status === 'backlog')

  // Apply filters
  if (filters.epicId) backlogStories = backlogStories.filter(s => featureToEpicId[s.feature_id] === filters.epicId)
  if (filters.assignees.length > 0) backlogStories = backlogStories.filter(s => s.assigned_agent_id && filters.assignees.includes(s.assigned_agent_id))
  if (filters.priorities.length > 0) backlogStories = backlogStories.filter(s => filters.priorities.includes(s.priority))
  if (filters.tags.length > 0) backlogStories = backlogStories.filter(s => s.tags.some(t => filters.tags.includes(t)))
  if (filters.search) {
    const q = filters.search.toLowerCase()
    backlogStories = backlogStories.filter(s => s.title.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q) || (s.short_id ?? '').toLowerCase().includes(q))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <span className="text-sm font-medium text-slate-600 flex-shrink-0">Backlog</span>
        <FilterBar agents={typedAgents} epics={epics as Epic[]} filters={filters} onChange={setFilters} />
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl space-y-1">
          <p className="text-xs text-slate-400 mb-3">{backlogStories.length} items</p>
          {backlogStories.map(s => {
            const agent = s.assigned_agent_id ? agentMap[s.assigned_agent_id] : null
            const feature = (features as any[]).find(f => f.id === s.feature_id)
            const epic = feature ? (epics as Epic[]).find(e => e.id === feature.epic_id) : null
            return (
              <div key={s.id}
                onClick={() => navigate(`/${projectKey}/stories/${s.short_id ?? s.id}`)}
                className="flex items-center gap-3 p-3 bg-white border rounded-lg hover:border-slate-300 cursor-pointer text-sm group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {s.short_id && <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">{s.short_id}</span>}
                    <span className="text-slate-800 font-medium group-hover:text-blue-600 truncate">{s.title}</span>
                  </div>
                  {(epic || feature) && (
                    <span className="text-xs text-slate-400 truncate block">
                      {epic?.title}{epic && feature ? ' › ' : ''}{feature?.title}
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
          {backlogStories.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Backlog is empty.</p>}
        </div>
      </div>
    </div>
  )
}
