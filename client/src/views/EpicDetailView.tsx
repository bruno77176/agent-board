import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Epic, Feature, Story, Agent } from '@/lib/api'
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

interface Props { epicId: string; projectKey: string }

export function EpicDetailView({ epicId }: Props) {
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set())

  const { data: epic, isLoading: epicLoading } = useQuery({
    queryKey: ['epic', epicId],
    queryFn: () => api.epics.get(epicId),
    enabled: !!epicId,
  })

  const epicProjectId = (epic as Epic | undefined)?.project_id

  const { data: stories = [] } = useQuery({
    queryKey: ['stories', epicProjectId],
    queryFn: () => api.stories.list(epicProjectId!),
    enabled: !!epicProjectId,
  })

  const { data: features = [] } = useQuery({
    queryKey: ['features', epicId],
    queryFn: () => api.features.list(epicId),
    enabled: !!epicId,
  })

  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: api.agents.list })

  const typedEpic = epic as Epic | undefined
  const typedFeatures = features as Feature[]
  const typedStories = stories as Story[]
  const typedAgents = agents as Agent[]
  const agentMap = Object.fromEntries(typedAgents.map(a => [a.id, a]))

  const toggleFeature = (id: string) => {
    setExpandedFeatures(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (epicLoading) {
    return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading epic...</div>
  }

  if (!typedEpic) {
    return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Epic not found</div>
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
        <button
          onClick={() => navigate(`/${projectKey ?? ''}/epics`)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Epics
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-slate-800">{typedEpic.title}</h1>
            {typedEpic.description && (
              <p className="text-xs text-slate-500 mt-1">{typedEpic.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {typedEpic.version && (
              <span className="text-xs text-slate-500 font-mono">{typedEpic.version}</span>
            )}
            <StatusBadge status={typedEpic.status} />
          </div>
        </div>
      </div>

      {/* Features + Stories */}
      <div className="flex-1 overflow-y-auto p-6">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Features ({typedFeatures.length})
        </h2>
        {typedFeatures.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">No features in this epic</div>
        ) : (
          <div className="space-y-2">
            {typedFeatures.map(feature => {
              const featureStories = typedStories.filter(s => s.feature_id === feature.id)
              const expanded = expandedFeatures.has(feature.id)
              return (
                <div key={feature.id} className="bg-white rounded-lg border border-slate-200">
                  <button
                    onClick={() => toggleFeature(feature.id)}
                    className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-slate-50 rounded-lg"
                  >
                    {expanded
                      ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    }
                    <span className="text-sm font-medium text-slate-800 flex-1 truncate">{feature.title}</span>
                    <span className="text-xs text-slate-400">{featureStories.length} stories</span>
                  </button>
                  {expanded && featureStories.length > 0 && (
                    <div className="border-t border-slate-100">
                      {featureStories.map(story => {
                        const agent = story.assigned_agent_id ? agentMap[story.assigned_agent_id] : null
                        return (
                          <button
                            key={story.id}
                            onClick={() => navigate(`/${projectKey ?? ''}/stories/${story.id}`)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-50 last:border-0"
                          >
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-300" />
                            <span className="text-xs text-slate-700 flex-1 truncate">{story.title}</span>
                            <span className="text-xs text-slate-400 capitalize">{story.priority}</span>
                            {agent && (
                              <span className="text-xs text-slate-400">{agent.avatar_emoji}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    done: 'bg-green-100 text-green-700',
    closed: 'bg-slate-100 text-slate-600',
  }
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium capitalize ${colors[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}
