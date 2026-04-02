import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { api } from '@/lib/api'
import type { Agent, Story } from '@/lib/api'

const STATUS_COLOR: Record<string, string> = {
  todo: 'bg-slate-100 text-slate-600',
  backlog: 'bg-slate-100 text-slate-500',
  in_progress: 'bg-blue-100 text-blue-700',
  review: 'bg-purple-100 text-purple-700',
  qa: 'bg-amber-100 text-amber-700',
  done: 'bg-green-100 text-green-700',
}

export function AgentProfileView() {
  const navigate = useNavigate()
  const { agentSlug } = useParams<{ agentSlug: string }>()

  const { data: agent, isLoading: agentLoading } = useQuery({
    queryKey: ['agent', agentSlug],
    queryFn: () => api.agents.get(agentSlug!),
    enabled: !!agentSlug,
  })

  const { data: stories = [], isLoading: storiesLoading } = useQuery({
    queryKey: ['agent-stories', agentSlug],
    queryFn: () => api.agents.stories(agentSlug!),
    enabled: !!agentSlug,
  })

  if (agentLoading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Loading…
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Agent not found.
      </div>
    )
  }

  const typedAgent = agent as Agent
  const typedStories = stories as Story[]

  const activeStories = typedStories.filter(s => s.status !== 'done' && s.status !== 'backlog')
  const doneStories = typedStories.filter(s => s.status === 'done')

  return (
    <div className="h-full overflow-y-auto bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
        <button
          onClick={() => navigate('/team')}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0"
          style={{ backgroundColor: typedAgent.color + '22' }}
        >
          {typedAgent.avatar_emoji}
        </div>
        <h1 className="text-base font-semibold text-slate-800">{typedAgent.name}</h1>
      </div>

      <div className="px-6 py-6 space-y-6 max-w-2xl">
        {/* Agent info */}
        <div className="space-y-1">
          {typedAgent.scope && (
            <p className="text-sm text-slate-600">{typedAgent.scope}</p>
          )}
          <p className="text-xs text-slate-400">@{typedAgent.slug}</p>
        </div>

        {/* Skills */}
        {typedAgent.skills.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Superpowers Skills</h3>
            <div className="flex flex-wrap gap-1.5">
              {typedAgent.skills.map(skill => (
                <span
                  key={skill}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: typedAgent.color + '22', color: typedAgent.color }}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Active stories */}
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Active Stories {activeStories.length > 0 && <span className="text-slate-300 font-normal">({activeStories.length})</span>}
          </h3>
          {storiesLoading ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : activeStories.length === 0 ? (
            <p className="text-xs text-slate-400">No active stories.</p>
          ) : (
            <ul className="space-y-2">
              {activeStories.map(s => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
                  onClick={() => {/* story detail requires projectKey — not available here */}}
                >
                  <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[s.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {s.status}
                  </span>
                  <span className="text-sm text-slate-700 truncate">{s.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Completed stories */}
        {doneStories.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Completed <span className="text-slate-300 font-normal">({doneStories.length})</span>
            </h3>
            <ul className="space-y-1">
              {doneStories.slice(0, 10).map(s => (
                <li key={s.id} className="text-xs text-slate-400 flex items-center gap-1.5">
                  <span className="text-green-400">✓</span>
                  <span className="truncate">{s.title}</span>
                </li>
              ))}
              {doneStories.length > 10 && (
                <li className="text-xs text-slate-300">+{doneStories.length - 10} more</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
