import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './lib/api'
import type { Project, Epic } from './lib/api'
import { useBoard } from './hooks/useBoard'
import { BoardView } from './views/BoardView'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

type View = 'board' | 'list' | 'backlog'

export default function App() {
  useBoard()
  const [projectId, setProjectId] = useState<string>('')
  const [epicId, setEpicId] = useState<string>('')
  const [view, setView] = useState<View>('board')

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list })
  const { data: epics = [] } = useQuery({
    queryKey: ['epics', projectId],
    queryFn: () => api.epics.list(projectId),
    enabled: !!projectId,
  })

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 h-12 flex items-center gap-3 flex-shrink-0">
        <span className="font-semibold text-sm text-slate-900 tracking-tight">Agent Board</span>
        <Separator orientation="vertical" className="h-4" />

        <Select value={projectId} onValueChange={(v) => { setProjectId(v ?? ''); setEpicId('') }}>
          <SelectTrigger className="w-44 h-7 text-xs border-slate-200">
            <SelectValue placeholder="Select project" />
          </SelectTrigger>
          <SelectContent>
            {(projects as Project[]).map(p => (
              <SelectItem key={p.id} value={p.id} className="text-xs">
                <span className="font-mono font-semibold text-slate-500 mr-1.5">{p.key}</span>{p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {projectId && (
          <Select value={epicId} onValueChange={(v) => setEpicId(v ?? '')}>
            <SelectTrigger className="w-56 h-7 text-xs border-slate-200">
              <SelectValue placeholder="All epics" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="" className="text-xs">All epics</SelectItem>
              {(epics as Epic[]).map(e => (
                <SelectItem key={e.id} value={e.id} className="text-xs">{e.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          {(['board', 'list', 'backlog'] as View[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1 text-xs rounded capitalize transition-colors ${
                view === v ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {v}
            </button>
          ))}
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-hidden">
        {projectId
          ? <BoardView projectId={projectId} epicId={epicId} view={view} />
          : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-slate-400 text-sm mb-1">No project selected</p>
                <p className="text-slate-300 text-xs">Use the selector above or create a project via MCP</p>
              </div>
            </div>
          )
        }
      </main>
    </div>
  )
}
