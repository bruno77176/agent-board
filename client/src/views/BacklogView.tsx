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
  if (filters.tags.length > 0) backlogStories = backlogStories.filter(s => s.tags.some(t => filters.tags.includes(t)))
  if (filters.search) {
    const q = filters.search.toLowerCase()
    backlogStories = backlogStories.filter(s =>
      s.title.toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q) ||
      (s.short_id ?? '').toLowerCase().includes(q)
    )
  }

  // Features to show
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
