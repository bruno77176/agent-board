import type { Agent, Epic } from '@/lib/api'

export interface Filters {
  assignee: string   // agent id or ''
  epic: string       // epic id or ''
  priority: string   // 'low' | 'medium' | 'high' | 'critical' | ''
  search: string
}

export const defaultFilters: Filters = { assignee: '', epic: '', priority: '', search: '' }

interface Props {
  agents: Agent[]
  epics: Epic[]
  filters: Filters
  onChange: (f: Filters) => void
}

export function FilterBar({ agents, epics, filters, onChange }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  const selectCls = 'h-7 px-2 text-xs border border-slate-200 rounded bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300'

  return (
    <div className="flex items-center gap-2 flex-1">
      <input
        type="search"
        placeholder="Search…"
        value={filters.search}
        onChange={e => set({ search: e.target.value })}
        className="h-7 px-2 text-xs border border-slate-200 rounded bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300 w-44"
      />
      <select value={filters.assignee} onChange={e => set({ assignee: e.target.value })} className={selectCls}>
        <option value="">Assignee</option>
        {agents.map(a => <option key={a.id} value={a.id}>{a.avatar_emoji} {a.name}</option>)}
      </select>
      <select value={filters.epic} onChange={e => set({ epic: e.target.value })} className={selectCls}>
        <option value="">Epic</option>
        {epics.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
      </select>
      <select value={filters.priority} onChange={e => set({ priority: e.target.value })} className={selectCls}>
        <option value="">Priority</option>
        {['low', 'medium', 'high', 'critical'].map(p => (
          <option key={p} value={p} className="capitalize">{p}</option>
        ))}
      </select>
      {(filters.assignee || filters.epic || filters.priority || filters.search) && (
        <button
          onClick={() => onChange(defaultFilters)}
          className="h-7 px-2 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded bg-white"
        >
          Clear
        </button>
      )}
    </div>
  )
}
