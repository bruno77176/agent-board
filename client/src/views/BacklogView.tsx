import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Story, Workflow, Project, Agent } from '@/lib/api'

interface Props { projectId: string }

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

export function BacklogView({ projectId }: Props) {
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()

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

  const typedAgents = agents as Agent[]
  const typedStories = (stories as Story[]).slice().sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
  )
  const agentMap = Object.fromEntries(typedAgents.map(a => [a.id, a]))

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-700">Backlog</h2>
        <p className="text-xs text-slate-400 mt-0.5">{typedStories.length} stories</p>
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
              const state = workflow?.states.find(st => st.id === s.status)
              return (
                <tr
                  key={s.id}
                  className="border-b hover:bg-slate-50 cursor-pointer"
                  onClick={() => navigate(`/${projectKey ?? ''}/stories/${s.id}`)}
                >
                  <td className="py-2.5 font-medium text-slate-800">{s.title}</td>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: state?.color }} />
                      {state?.label ?? s.status}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <PriorityBadge priority={s.priority} />
                  </td>
                  <td className="py-2.5 text-xs text-slate-500">
                    {agent ? `${agent.avatar_emoji} ${agent.name}` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {typedStories.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-sm">No stories in backlog</div>
        )}
      </div>
    </div>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-slate-100 text-slate-600',
  }
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium capitalize ${colors[priority] ?? 'bg-slate-100 text-slate-600'}`}>
      {priority}
    </span>
  )
}
