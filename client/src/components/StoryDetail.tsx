import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Story, Agent } from '@/lib/api'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'

interface Props {
  story: Story
  agents: Agent[]
  onClose: () => void
}

export function StoryDetail({ story, agents, onClose }: Props) {
  const agentMap = Object.fromEntries(agents.map(a => [a.id, a]))
  const assignedAgent = story.assigned_agent_id ? agentMap[story.assigned_agent_id] : null

  const { data: events = [] } = useQuery({
    queryKey: ['events', story.id],
    queryFn: () => api.events.list(story.id, 'story'),
  })

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-slate-200 shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b">
        <div className="flex-1 pr-4">
          <p className="text-xs text-slate-400 mb-1 font-mono">story</p>
          <h2 className="text-sm font-semibold text-slate-800 leading-snug">{story.title}</h2>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 mt-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-slate-400 mb-1">Status</p>
              <Badge variant="outline">{story.status}</Badge>
            </div>
            <div>
              <p className="text-slate-400 mb-1">Priority</p>
              <Badge variant="outline" className="capitalize">{story.priority}</Badge>
            </div>
            {assignedAgent && (
              <div>
                <p className="text-slate-400 mb-1">Agent</p>
                <span className="flex items-center gap-1.5">
                  <span>{assignedAgent.avatar_emoji}</span>
                  <span className="font-medium text-slate-700">{assignedAgent.name}</span>
                </span>
              </div>
            )}
            {story.git_branch && (
              <div>
                <p className="text-slate-400 mb-1">Branch</p>
                <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{story.git_branch}</code>
              </div>
            )}
            {story.estimated_minutes && (
              <div>
                <p className="text-slate-400 mb-1">Estimate</p>
                <span>{story.estimated_minutes} min</span>
              </div>
            )}
          </div>

          {story.description && (
            <div>
              <p className="text-xs text-slate-400 mb-1">Description</p>
              <p className="text-sm text-slate-700 leading-relaxed">{story.description}</p>
            </div>
          )}

          {/* Activity feed */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Activity</p>
            {events.length === 0 ? (
              <p className="text-xs text-slate-400">No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {events.map((ev) => {
                  const agent = ev.agent_id ? agentMap[ev.agent_id] : null
                  return (
                    <div key={ev.id} className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px]">
                        {agent ? agent.avatar_emoji : '💬'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-medium text-slate-700">{agent?.name ?? 'System'}</span>
                          {ev.to_status && (
                            <span className="text-[10px] text-slate-400">→ {ev.to_status}</span>
                          )}
                          <span className="text-[10px] text-slate-400 ml-auto">
                            {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {ev.comment && <p className="text-xs text-slate-600">{ev.comment}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
