import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Epic } from '@/lib/api'

interface Props { projectId: string; projectKey?: string }

export function EpicsView({ projectId }: Props) {
  const { projectKey: paramKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()

  const { data: epics = [], isLoading } = useQuery({
    queryKey: ['epics', projectId],
    queryFn: () => api.epics.list(projectId),
    enabled: !!projectId,
  })

  const typedEpics = epics as Epic[]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading epics...</div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-700">Epics</h2>
        <p className="text-xs text-slate-400 mt-0.5">{typedEpics.length} epics</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {typedEpics.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">No epics yet</div>
        ) : (
          <div className="grid gap-3">
            {typedEpics.map(epic => (
              <button
                key={epic.id}
                onClick={() => navigate(`/${paramKey ?? ''}/epics/${epic.id}`)}
                className="text-left p-4 bg-white rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{epic.title}</p>
                    {epic.description && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{epic.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {epic.version && (
                      <span className="text-xs text-slate-500 font-mono">{epic.version}</span>
                    )}
                    <StatusBadge status={epic.status} />
                  </div>
                </div>
              </button>
            ))}
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
