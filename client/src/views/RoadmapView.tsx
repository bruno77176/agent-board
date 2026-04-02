import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Epic } from '@/lib/api'
import { ChevronLeft, ChevronRight } from 'lucide-react'

function getQuarter(date: Date) {
  const q = Math.floor(date.getMonth() / 3)
  const start = new Date(date.getFullYear(), q * 3, 1)
  const end = new Date(date.getFullYear(), q * 3 + 3, 0)
  return { start, end, label: `Q${q + 1} ${date.getFullYear()}` }
}

function dateToX(date: Date, rangeStart: Date, rangeEnd: Date, width: number): number {
  const total = rangeEnd.getTime() - rangeStart.getTime()
  const offset = Math.max(0, date.getTime() - rangeStart.getTime())
  return Math.min(width, (offset / total) * width)
}

const TRACK_WIDTH = 800
const ROW_HEIGHT = 44

interface Props { projectId: string }

export function RoadmapView({ projectId }: Props) {
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const [quarterOffset, setQuarterOffset] = useState(0)

  const refDate = new Date(new Date().getFullYear(), new Date().getMonth() + quarterOffset * 3, 1)
  const { start: rangeStart, end: rangeEnd, label: quarterLabel } = getQuarter(refDate)

  const { data: epics = [] } = useQuery({
    queryKey: ['epics', projectId],
    queryFn: () => api.epics.list(projectId),
    enabled: !!projectId,
  })

  const typedEpics = epics as Epic[]
  const todayX = dateToX(new Date(), rangeStart, rangeEnd, TRACK_WIDTH)

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <button onClick={() => setQuarterOffset(q => q - 1)} className="p-1 hover:bg-slate-100 rounded">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium text-slate-700 w-24 text-center">{quarterLabel}</span>
        <button onClick={() => setQuarterOffset(q => q + 1)} className="p-1 hover:bg-slate-100 rounded">
          <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={() => setQuarterOffset(0)} className="text-xs text-slate-400 hover:text-slate-600 ml-2">Today</button>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-auto p-6">
        <div className="flex">
          {/* Epic labels column */}
          <div className="w-52 flex-shrink-0">
            <div className="h-8 border-b border-slate-200 mb-0" />
            {typedEpics.map(epic => (
              <div key={epic.id} style={{ height: ROW_HEIGHT }}
                className="flex items-center pr-4 border-b border-slate-100">
                <button
                  onClick={() => navigate(`/${projectKey}/epics/${epic.short_id ?? epic.id}`)}
                  className="text-xs text-slate-700 font-medium hover:text-blue-600 truncate text-left w-full"
                  title={epic.title}
                >
                  <span className="text-slate-400 font-mono mr-1">{epic.short_id}</span>
                  {epic.title}
                </button>
              </div>
            ))}
          </div>

          {/* Gantt area */}
          <div className="flex-1 overflow-x-auto">
            {/* Month header */}
            <div className="h-8 border-b border-slate-200 relative" style={{ width: TRACK_WIDTH }}>
              {[0, 1, 2].map(i => {
                const month = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + i, 1)
                const x = dateToX(month, rangeStart, rangeEnd, TRACK_WIDTH)
                return (
                  <span key={i} className="absolute bottom-1 text-[10px] text-slate-400 pl-1"
                    style={{ left: x }}>
                    {month.toLocaleString('default', { month: 'short' })}
                  </span>
                )
              })}
            </div>

            {/* SVG bars */}
            <svg width={TRACK_WIDTH} height={typedEpics.length * ROW_HEIGHT}>
              {/* Today line */}
              {todayX > 0 && todayX < TRACK_WIDTH && (
                <line x1={todayX} y1={0} x2={todayX} y2={typedEpics.length * ROW_HEIGHT}
                  stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 2" />
              )}

              {typedEpics.map((epic, i) => {
                const y = i * ROW_HEIGHT + ROW_HEIGHT / 2
                if (!epic.start_date || !epic.end_date) {
                  return (
                    <g key={epic.id}>
                      <circle cx={8} cy={y} r={4} fill="#cbd5e1" />
                      <text x={16} y={y + 4} fontSize={10} fill="#94a3b8">(no dates set)</text>
                    </g>
                  )
                }
                const x1 = dateToX(new Date(epic.start_date), rangeStart, rangeEnd, TRACK_WIDTH)
                const x2 = dateToX(new Date(epic.end_date), rangeStart, rangeEnd, TRACK_WIDTH)
                const barW = Math.max(6, x2 - x1)
                return (
                  <g key={epic.id} style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/${projectKey}/epics/${epic.short_id ?? epic.id}`)}>
                    <rect x={x1} y={y - 11} width={barW} height={22} rx={4} fill="#6366f1" fillOpacity={0.85} />
                    {barW > 50 && (
                      <text x={x1 + 6} y={y + 4} fontSize={10} fill="white" style={{ pointerEvents: 'none' }}>
                        {epic.title.slice(0, Math.floor(barW / 7))}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>

        {typedEpics.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-12">No epics yet. Create an epic to get started.</p>
        )}

        <p className="text-xs text-slate-400 mt-6">
          Set epic date ranges from the epic detail view.
        </p>
      </div>
    </div>
  )
}
