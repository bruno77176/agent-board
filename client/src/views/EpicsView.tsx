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
          <div className="divide-y divide-slate-100 bg-white rounded-lg border border-slate-200 overflow-hidden">
            {typedEpics.map(epic => (
              <button
                key={epic.id}
                onClick={() => navigate(`/${paramKey ?? ''}/epics/${epic.short_id ?? epic.id}`)}
                className="text-left w-full px-4 py-3 bg-white border-b border-slate-100 hover:bg-slate-50 transition-colors flex items-center gap-3"
              >
                {epic.short_id && (
                  <span className="text-xs font-mono text-slate-400 flex-shrink-0 w-20">{epic.short_id}</span>
                )}
                <span className="flex-1 text-sm text-slate-800 truncate">{epic.title}</span>
                <StatusBadge status={epic.status} />
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
