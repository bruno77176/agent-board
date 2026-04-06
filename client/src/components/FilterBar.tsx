import type { Agent, Epic, Feature } from '@/lib/api'

export interface Filters {
  assignees: string[]
  tags: string[]
  priorities: string[]
  epicId: string
  featureId: string
  itemType: 'all' | 'stories' | 'features'
  search: string
}

export const defaultFilters: Filters = { assignees: [], tags: [], priorities: [], epicId: '', featureId: '', itemType: 'all', search: '' }

interface Props {
  agents: Agent[]
  epics: Epic[]
  features: Feature[]
  filters: Filters
  onChange: (f: Filters) => void
}

export function FilterBar({ agents, epics, features, filters, onChange }: Props) {
  const hasFilters = filters.assignees.length > 0 || filters.priorities.length > 0 || filters.tags.length > 0
    || filters.epicId || filters.featureId || filters.search || filters.itemType !== 'all'
  const selectCls = 'h-7 px-2 text-xs border border-slate-200 rounded bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300'

  const toggleAssignee = (id: string) => {
    const next = filters.assignees.includes(id)
      ? filters.assignees.filter(x => x !== id)
      : [...filters.assignees, id]
    onChange({ ...filters, assignees: next })
  }

  const togglePriority = (p: string) => {
    const next = filters.priorities.includes(p)
      ? filters.priorities.filter(x => x !== p)
      : [...filters.priorities, p]
    onChange({ ...filters, priorities: next })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 flex-1">
      {/* Search */}
      <input
        type="search"
        placeholder="Search…"
        value={filters.search}
        onChange={e => onChange({ ...filters, search: e.target.value })}
        className="h-7 px-2 text-xs border border-slate-200 rounded bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300 w-full md:w-36"
      />

      {/* Assignee avatar pills (multi-select) */}
      <div className="flex items-center gap-0.5">
        {agents.map(a => (
          <button
            key={a.id}
            title={a.name}
            onClick={() => toggleAssignee(a.id)}
            className={`w-7 h-7 rounded-full text-sm flex items-center justify-center border-2 transition-all ${
              filters.assignees.includes(a.id)
                ? 'border-blue-500 scale-110'
                : 'border-transparent opacity-50 hover:opacity-100'
            }`}
            style={{ background: a.color + '22' }}
          >
            {a.avatar_emoji}
          </button>
        ))}
      </div>

      {/* Priority (multi-select via chips) */}
      <div className="flex items-center gap-1">
        {(['high', 'medium', 'low'] as const).map(p => (
          <button
            key={p}
            onClick={() => togglePriority(p)}
            className={`h-6 px-2 text-xs rounded-full border capitalize transition-colors ${
              filters.priorities.includes(p)
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'border-slate-200 text-slate-500 hover:border-slate-400'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Item type toggle */}
      <div className="flex items-center gap-1">
        {(['all', 'stories', 'features'] as const).map(t => (
          <button
            key={t}
            onClick={() => onChange({ ...filters, itemType: t })}
            className={`h-6 px-2 text-xs rounded-full border capitalize transition-colors ${
              filters.itemType === t
                ? 'bg-slate-800 border-slate-800 text-white'
                : 'border-slate-200 text-slate-500 hover:border-slate-400'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Epic filter */}
      {epics.length > 0 && (
        <select value={filters.epicId} onChange={e => onChange({ ...filters, epicId: e.target.value })} className={selectCls}>
          <option value="">Epic</option>
          {epics.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
      )}

      {/* Feature filter — shown when not in "features only" mode */}
      {filters.itemType !== 'features' && features.length > 0 && (
        <select
          value={filters.featureId}
          onChange={e => onChange({ ...filters, featureId: e.target.value })}
          className={selectCls}
        >
          <option value="">Feature</option>
          {features.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
        </select>
      )}

      {hasFilters && (
        <button
          onClick={() => onChange(defaultFilters)}
          className="h-7 px-2 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded bg-white ml-auto"
        >
          Clear
        </button>
      )}
    </div>
  )
}
