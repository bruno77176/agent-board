import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Agent } from '@/lib/api'

export function TeamView() {
  const navigate = useNavigate()

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: api.agents.list,
  })

  const typedAgents = agents as Agent[]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Loading…
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="px-6 py-5 border-b border-slate-200">
        <h1 className="text-base font-semibold text-slate-800">Team</h1>
        <p className="text-xs text-slate-400 mt-0.5">{typedAgents.length} agents on the roster</p>
      </div>

      <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {typedAgents.map(agent => (
          <button
            key={agent.id}
            onClick={() => navigate(`/team/${agent.slug}`)}
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left transition-colors"
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
              style={{ backgroundColor: agent.color + '22' }}
            >
              {agent.avatar_emoji}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{agent.name}</p>
              <p className="text-xs text-slate-400 truncate">{agent.scope ?? 'No scope defined'}</p>
              {agent.skills.length > 0 && (
                <p className="text-xs text-slate-300 truncate mt-0.5">
                  {agent.skills.slice(0, 3).join(' · ')}
                  {agent.skills.length > 3 && ` +${agent.skills.length - 3}`}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
