import { useState } from 'react'
import type { AcceptanceCriterion } from '@/lib/api'
import { Plus, Trash2 } from 'lucide-react'

const genId = () => crypto.randomUUID()

interface Props {
  items: AcceptanceCriterion[]
  onChange: (items: AcceptanceCriterion[]) => void
  readOnly?: boolean
}

export function AcceptanceCriteria({ items, onChange, readOnly = false }: Props) {
  const [newText, setNewText] = useState('')

  const toggle = (id: string) =>
    onChange(items.map(item => item.id === id ? { ...item, checked: !item.checked } : item))

  const remove = (id: string) => onChange(items.filter(item => item.id !== id))

  const add = () => {
    if (!newText.trim()) return
    onChange([...items, { id: genId(), text: newText.trim(), checked: false }])
    setNewText('')
  }

  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Acceptance Criteria</h3>
      <div className="space-y-1.5">
        {items.map(item => (
          <div key={item.id} className="flex items-start gap-2 group">
            <input
              type="checkbox"
              checked={item.checked}
              onChange={() => toggle(item.id)}
              disabled={readOnly}
              className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 flex-shrink-0 cursor-pointer"
            />
            <span className={`text-sm flex-1 ${item.checked ? 'line-through text-slate-400' : 'text-slate-700'}`}>
              {item.text}
            </span>
            {!readOnly && (
              <button
                onClick={() => remove(item.id)}
                className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-opacity flex-shrink-0"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
        {items.length === 0 && !readOnly && (
          <p className="text-xs text-slate-300 italic">No criteria yet.</p>
        )}
      </div>

      {!readOnly && (
        <div className="flex items-center gap-2 mt-2">
          <input
            type="text"
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="Add criterion…"
            className="flex-1 text-xs border-0 border-b border-slate-200 focus:border-blue-400 focus:outline-none py-1 text-slate-700 bg-transparent"
          />
          <button
            onClick={add}
            disabled={!newText.trim()}
            className="text-blue-500 hover:text-blue-700 disabled:opacity-30"
          >
            <Plus size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
