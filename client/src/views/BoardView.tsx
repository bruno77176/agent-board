import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Story, Workflow, Project, Agent, Epic } from '@/lib/api'
import { KanbanColumn } from '@/components/KanbanColumn'
import { FilterBar, defaultFilters } from '@/components/FilterBar'
import type { Filters } from '@/components/FilterBar'

type View = 'board' | 'list'

interface Props { projectId: string }

export function BoardView({ projectId }: Props) {
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const [view, setView] = useState<View>('board')
  const [filters, setFilters] = useState<Filters>(defaultFilters)

  const { data: stories = [] } = useQuery({
    queryKey: ['stories', projectId],
    queryFn: () => api.stories.list(projectId),
    enabled: !!projectId,
  })

  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: api.agents.list })
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list })
  const { data: workflows = [] } = useQuery({ queryKey: ['workflows'], queryFn: api.workflows.list })
  const { data: epics = [] } = useQuery({
    queryKey: ['epics', projectId],
    queryFn: () => api.epics.list(projectId),
    enabled: !!projectId,
  })

  const project = (projects as Project[]).find(p => p.id === projectId)
  const workflow = (workflows as Workflow[]).find(w => w.id === project?.workflow_id)

  if (!workflow) return (
    <div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading board...</div>
  )

  const typedAgents = agents as Agent[]
  const typedEpics = epics as Epic[]
  const typedStories = stories as Story[]
  const agentMap = Object.fromEntries(typedAgents.map(a => [a.id, a]))

  // Apply filters
  const filteredStories = typedStories.filter(s => {
    if (filters.assignees.length > 0 && (!s.assigned_agent_id || !filters.assignees.includes(s.assigned_agent_id))) return false
    if (filters.priorities.length > 0 && !filters.priorities.includes(s.priority)) return false
    if (filters.tags.length > 0 && !s.tags.some(t => filters.tags.includes(t))) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      if (!s.title.toLowerCase().includes(q) && !(s.description ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const handleStoryClick = (story: Story) => {
    navigate(`/${projectKey ?? ''}/stories/${story.id}`)
  }

  const toolbar = (
    <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0">
      <div className="flex items-center gap-1">
        {(['board', 'list'] as View[]).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-3 py-1 text-xs rounded capitalize transition-colors ${
              view === v ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {v}
          </button>
        ))}
      </div>
      <FilterBar agents={typedAgents} epics={typedEpics} filters={filters} onChange={setFilters} />
    </div>
  )

  if (view === 'board') {
    return (
      <div className="h-full flex flex-col">
        {toolbar}
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-5 p-6 h-full min-w-max items-start">
            {workflow.states.map(state => (
              <KanbanColumn
                key={state.id}
                state={state}
                stories={filteredStories.filter(s => s.status === state.id)}
                agents={typedAgents}
                onCardClick={handleStoryClick}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="h-full flex flex-col">
      {toolbar}
      <div className="flex-1 overflow-y-auto px-6 pt-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-xs text-slate-500 uppercase tracking-wide">
              <th className="text-left pb-3 font-semibold">Title</th>
              <th className="text-left pb-3 font-semibold">Status</th>
              <th className="text-left pb-3 font-semibold">Priority</th>
              <th className="text-left pb-3 font-semibold">Agent</th>
            </tr>
          </thead>
          <tbody>
            {filteredStories.map(s => {
              const agent = s.assigned_agent_id ? agentMap[s.assigned_agent_id] : null
              const state = workflow.states.find(st => st.id === s.status)
              return (
                <tr key={s.id} className="border-b hover:bg-slate-50 cursor-pointer"
                  onClick={() => handleStoryClick(s)}>
                  <td className="py-2.5 font-medium text-slate-800">{s.title}</td>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: state?.color }} />
                      {state?.label ?? s.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-xs text-slate-500 capitalize">{s.priority}</td>
                  <td className="py-2.5 text-xs text-slate-500">
                    {agent ? `${agent.avatar_emoji} ${agent.name}` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
