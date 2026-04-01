import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Story, Workflow, Project, Agent } from '@/lib/api'
import { KanbanColumn } from '@/components/KanbanColumn'
import { StoryDetail } from '@/components/StoryDetail'

interface Props { projectId: string; view: 'board' | 'list' | 'backlog' }

export function BoardView({ projectId, view }: Props) {
  const [selectedStory, setSelectedStory] = useState<Story | null>(null)

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
  const agentMap = Object.fromEntries(typedAgents.map(a => [a.id, a]))

  if (view === 'board') {
    return (
      <>
        <div className="h-full overflow-x-auto">
          <div className="flex gap-5 p-6 h-full min-w-max items-start">
            {workflow.states.map(state => (
              <KanbanColumn
                key={state.id}
                state={state}
                stories={(stories as Story[]).filter(s => s.status === state.id)}
                agents={typedAgents}
                onCardClick={setSelectedStory}
              />
            ))}
          </div>
        </div>
        {selectedStory && (
          <StoryDetail
            story={selectedStory}
            agents={typedAgents}
            onClose={() => setSelectedStory(null)}
          />
        )}
      </>
    )
  }

  if (view === 'list') {
    return (
      <>
        <div className="p-6 overflow-y-auto h-full">
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
              {(stories as Story[]).map(s => {
                const agent = s.assigned_agent_id ? agentMap[s.assigned_agent_id] : null
                const state = workflow.states.find(st => st.id === s.status)
                return (
                  <tr key={s.id} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedStory(s)}>
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
        {selectedStory && <StoryDetail story={selectedStory} agents={typedAgents} onClose={() => setSelectedStory(null)} />}
      </>
    )
  }

  // Backlog
  const backlogStories = (stories as Story[]).filter(s => s.status === 'backlog')
  return (
    <>
      <div className="p-6 overflow-y-auto h-full">
        <h2 className="text-sm font-semibold text-slate-600 mb-4">Backlog — {backlogStories.length} items</h2>
        <div className="flex flex-col gap-2 max-w-2xl">
          {backlogStories.map(s => {
            const agent = s.assigned_agent_id ? agentMap[s.assigned_agent_id] : null
            return (
              <div key={s.id} onClick={() => setSelectedStory(s)}
                className="flex items-center gap-3 p-3 bg-white border rounded-lg hover:border-slate-300 cursor-pointer text-sm">
                <span className="flex-1 text-slate-800 font-medium">{s.title}</span>
                <span className="text-xs text-slate-400 capitalize">{s.priority}</span>
                {agent && <span>{agent.avatar_emoji}</span>}
              </div>
            )
          })}
          {backlogStories.length === 0 && <p className="text-sm text-slate-400">Backlog is empty.</p>}
        </div>
      </div>
      {selectedStory && <StoryDetail story={selectedStory} agents={typedAgents} onClose={() => setSelectedStory(null)} />}
    </>
  )
}
