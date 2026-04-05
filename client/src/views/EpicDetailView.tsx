import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Epic, Feature, Story } from '@/lib/api'
import { ArrowLeft } from 'lucide-react'
import { MarkdownContent, stripMarkdown } from '@/components/MarkdownContent'
import { planDisplayName } from '@/lib/utils'

interface Props { epicId: string; projectKey: string }

export function EpicDetailView({ epicId }: Props) {
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

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

  const updateEpic = useMutation({
    mutationFn: (data: Partial<Epic>) => api.epics.update((epic as Epic).id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['epics'] })
      queryClient.invalidateQueries({ queryKey: ['epic', epicId] })
    },
  })

  const typedEpic = epic as Epic | undefined
  const typedFeatures = features as Feature[]
  const typedStories = stories as Story[]

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
            <div className="flex items-center gap-4 mt-2">
              <label className="text-xs text-slate-500">
                Start
                <input type="date" value={typedEpic.start_date ?? ''}
                  onChange={e => updateEpic.mutate({ start_date: e.target.value || null })}
                  className="ml-2 text-xs border border-slate-200 rounded px-2 py-0.5" />
              </label>
              <label className="text-xs text-slate-500">
                End
                <input type="date" value={typedEpic.end_date ?? ''}
                  onChange={e => updateEpic.mutate({ end_date: e.target.value || null })}
                  className="ml-2 text-xs border border-slate-200 rounded px-2 py-0.5" />
              </label>
              {typedEpic.source_doc && (
                <button
                  onClick={() => {
                    const slug = typedEpic.source_doc!.split('/').pop()!.replace(/\.md$/, '')
                    navigate(`/${projectKey}/docs/${slug}`)
                  }}
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                >
                  <span>📄</span>
                  <span>{planDisplayName(typedEpic.source_doc)}</span>
                </button>
              )}
            </div>
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
        {typedEpic.description && (
          <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
            <MarkdownContent>{typedEpic.description}</MarkdownContent>
          </div>
        )}
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Features ({typedFeatures.length})
        </h2>
        {typedFeatures.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">No features in this epic</div>
        ) : (
          <div className="space-y-2">
            {typedFeatures.map(feature => {
              const featureStories = typedStories.filter(s => s.feature_id === feature.id)
              return (
                <div
                  key={feature.id}
                  onClick={() => navigate(`/${projectKey ?? ''}/features/${feature.short_id ?? feature.id}`)}
                  className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex items-center gap-3 hover:border-slate-300 cursor-pointer group"
                >
                  <div className="flex-1 min-w-0">
                    {feature.short_id && (
                      <span className="text-xs font-mono text-slate-400 block mb-0.5">{feature.short_id}</span>
                    )}
                    <span className="text-sm font-medium text-slate-800 group-hover:text-blue-600">{feature.title}</span>
                    {feature.description && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{stripMarkdown(feature.description)}</p>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">{featureStories.length} stories</span>
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
