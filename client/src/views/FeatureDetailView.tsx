import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Feature, Story, Agent, Epic } from '@/lib/api'
import { ArrowLeft } from 'lucide-react'
import { MarkdownContent } from '@/components/MarkdownContent'

interface Props { featureId: string; projectKey: string }

export function FeatureDetailView({ featureId, projectKey }: Props) {
  const navigate = useNavigate()

  const { data: feature, isLoading } = useQuery({
    queryKey: ['feature', featureId],
    queryFn: () => api.features.get(featureId),
    enabled: !!featureId,
  })

  const typedFeature = feature as Feature | undefined

  const { data: epic } = useQuery({
    queryKey: ['epic', typedFeature?.epic_id],
    queryFn: () => api.epics.get(typedFeature!.epic_id),
    enabled: !!typedFeature?.epic_id,
  })

  const { data: stories = [] } = useQuery({
    queryKey: ['stories', 'feature', featureId],
    queryFn: () => api.stories.listByFeature(featureId),
    enabled: !!featureId,
  })

  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: api.agents.list })

  const typedStories = stories as Story[]
  const typedAgents = agents as Agent[]
  const typedEpic = epic as Epic | undefined
  const agentMap = Object.fromEntries(typedAgents.map(a => [a.id, a]))

  if (isLoading) return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading...</div>
  if (!typedFeature) return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Feature not found</div>

  const statusColors: Record<string, string> = {
    backlog: 'bg-slate-100 text-slate-600',
    ready: 'bg-blue-50 text-blue-600',
    in_progress: 'bg-yellow-50 text-yellow-700',
    in_review: 'bg-purple-50 text-purple-700',
    done: 'bg-green-50 text-green-700',
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
        <button
          onClick={() => typedEpic ? navigate(`/${projectKey}/epics/${typedEpic.short_id ?? typedEpic.id}`) : navigate(-1)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {typedEpic ? `Back to ${typedEpic.title}` : 'Back'}
        </button>
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
          {typedEpic && (
            <button
              onClick={() => navigate(`/${projectKey}/epics/${typedEpic.short_id ?? typedEpic.id}`)}
              className="font-medium text-slate-500 hover:text-blue-600"
            >
              {typedEpic.title}
            </button>
          )}
          {typedEpic && <span>›</span>}
          <span>Feature</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {typedFeature.short_id && (
              <span className="text-xs font-mono text-slate-400 block mb-1">{typedFeature.short_id}</span>
            )}
            <h1 className="text-base font-semibold text-slate-800">{typedFeature.title}</h1>
          </div>
        </div>
        {typedFeature.tags && typedFeature.tags.length > 0 && (
          <div className="flex gap-1 mt-3">
            {typedFeature.tags.map((t: string) => (
              <span key={t} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{t}</span>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {typedFeature.description && (
          <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
            <MarkdownContent>{typedFeature.description}</MarkdownContent>
          </div>
        )}
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Stories ({typedStories.length})
        </h2>
        {typedStories.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">No stories in this feature yet.</div>
        ) : (
          <div className="space-y-1">
            {typedStories.map(story => {
              const agent = story.assigned_agent_id ? agentMap[story.assigned_agent_id] : null
              return (
                <div
                  key={story.id}
                  onClick={() => navigate(`/${projectKey}/stories/${story.short_id ?? story.id}`)}
                  className="flex items-center gap-3 p-3 bg-white border rounded-lg hover:border-slate-300 cursor-pointer text-sm group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {story.short_id && (
                        <span className="text-xs font-mono text-slate-400 flex-shrink-0">{story.short_id}</span>
                      )}
                      <span className="text-slate-800 font-medium group-hover:text-blue-600 truncate">{story.title}</span>
                    </div>
                    {story.estimated_minutes && (
                      <span className="text-xs text-slate-400">{story.estimated_minutes} min</span>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${statusColors[story.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {story.status.replace('_', ' ')}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border capitalize flex-shrink-0 ${
                    story.priority === 'high' ? 'border-red-200 text-red-600' :
                    story.priority === 'medium' ? 'border-amber-200 text-amber-600' :
                    'border-slate-200 text-slate-400'
                  }`}>{story.priority}</span>
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
          </div>
        )}
      </div>
    </div>
  )
}
