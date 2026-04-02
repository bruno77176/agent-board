import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Story, Workflow, Project, Agent } from '@/lib/api'
import { KanbanColumn } from '@/components/KanbanColumn'

type View = 'board' | 'list'

interface Props { projectId: string }

export function BoardView({ projectId }: Props) {
  const { projectKey } = useParams<{ projectKey: string }>()
  const [view, setView] = useState<View>('board')

  const { data: stories = [] } = useQuery({
    queryKey: ['stories', projectId],
    queryFn: () => api.stories.list(projectId),
    enabled: !!projectId,
  })

  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: api.agents.list })
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list })
  const { data: workflows = [] } = useQuery({ queryKey: ['workflows'], queryFn: api.workflows.list })

  const project = (projects as Project[]).find(p => p.id === projectId)
  const workflow = (workflows as Workflow[]).find(w => w.id === project?.workflow_id)

  if (!workflow) return (
    <div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading board...</div>
  )

  const typedAgents = agents as Agent[]
  const typedStories = stories as Story[]
  const agentMap = Object.fromEntries(typedAgents.map(a => [a.id, a]))

  const handleStoryClick = (story: Story) => {
    // Navigate to story detail — Task 12 will implement the full view
    window.history.pushState(null, '', `/${projectKey ?? ''}/stories/${story.id}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  if (view === 'board') {
    return (
      <div className="h-full flex flex-col">
        {/* View toggle */}
        <div className="flex items-center gap-1 px-6 pt-4 pb-0 flex-shrink-0">
          {(['board', 'list'] as View[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1 text-xs rounded capitalize transition-colors ${
                view === v ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {v}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-5 p-6 h-full min-w-max items-start">
            {workflow.states.map(state => (
              <KanbanColumn
                key={state.id}
                state={state}
                stories={typedStories.filter(s => s.status === state.id)}
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
      {/* View toggle */}
      <div className="flex items-center gap-1 px-6 pt-4 pb-0 flex-shrink-0">
        {(['board', 'list'] as View[]).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-3 py-1 text-xs rounded capitalize transition-colors ${
              view === v ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {v}
          </button>
        ))}
      </div>
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
            {typedStories.map(s => {
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
