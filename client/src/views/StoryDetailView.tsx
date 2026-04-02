import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { api } from '@/lib/api'
import type { Story, Agent } from '@/lib/api'
import { AcceptanceCriteria } from '@/components/AcceptanceCriteria'

interface Props { storyId?: string; projectKey?: string }

const PRIORITY_COLOR: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
}

export function StoryDetailView({ storyId, projectKey }: Props) {
  const navigate = useNavigate()

  const { data: story, isLoading } = useQuery({
    queryKey: ['story', storyId],
    queryFn: () => api.stories.get(storyId!),
    enabled: !!storyId,
  })

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: api.agents.list,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Loading…
      </div>
    )
  }

  if (!story) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Story not found.
      </div>
    )
  }

  const typedStory = story as Story
  const typedAgents = agents as Agent[]
  const assignee = typedAgents.find(a => a.id === typedStory.assigned_agent_id)

  return (
    <div className="h-full overflow-y-auto bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
        <button
          onClick={() => navigate(`/${projectKey}/board`)}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-semibold text-slate-800 truncate flex-1">
          {typedStory.title}
        </h1>
      </div>

      {/* Body */}
      <div className="px-6 py-6 space-y-6 max-w-2xl">
        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_COLOR[typedStory.priority] ?? 'bg-slate-100 text-slate-600'}`}>
            {typedStory.priority}
          </span>
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            {typedStory.status}
          </span>
          {typedStory.estimated_minutes != null && (
            <span className="text-xs text-slate-400">{typedStory.estimated_minutes} min</span>
          )}
          {assignee && (
            <span className="text-xs text-slate-500 flex items-center gap-1 ml-auto">
              <span>{assignee.avatar_emoji}</span>
              <span>{assignee.name}</span>
            </span>
          )}
        </div>

        {/* Description */}
        {typedStory.description && (
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Description</h3>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{typedStory.description}</p>
          </div>
        )}

        {/* Tags */}
        {typedStory.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {typedStory.tags.map(tag => (
              <span key={tag} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{tag}</span>
            ))}
          </div>
        )}

        {/* Acceptance Criteria */}
        <AcceptanceCriteria storyId={typedStory.id} criteria={typedStory.acceptance_criteria} />

        {/* Git branch */}
        {typedStory.git_branch && (
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Branch</h3>
            <code className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">{typedStory.git_branch}</code>
          </div>
        )}

        {/* Events / Activity */}
        {typedStory.events && typedStory.events.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Activity</h3>
            <ul className="space-y-2">
              {typedStory.events.map(e => {
                const actor = typedAgents.find(a => a.id === e.agent_id)
                return (
                  <li key={e.id} className="text-xs text-slate-500 flex gap-2">
                    <span className="shrink-0">{actor ? actor.avatar_emoji : '🤖'}</span>
                    <span>
                      {e.from_status && e.to_status
                        ? `${e.from_status} → ${e.to_status}`
                        : e.comment ?? ''}
                      {e.comment && e.from_status ? ` — ${e.comment}` : ''}
                    </span>
                    <span className="ml-auto shrink-0 text-slate-300">
                      {new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
