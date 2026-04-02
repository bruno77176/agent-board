import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AcceptanceCriterion } from '@/lib/api'

interface Props {
  storyId: string
  criteria: AcceptanceCriterion[]
}

export function AcceptanceCriteria({ storyId, criteria }: Props) {
  const queryClient = useQueryClient()

  const toggle = useMutation({
    mutationFn: (criterion: AcceptanceCriterion) =>
      api.stories.update(storyId, {
        acceptance_criteria: criteria.map(c =>
          c.id === criterion.id ? { ...c, checked: !c.checked } : c
        ),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['story', storyId] })
    },
  })

  if (criteria.length === 0) return null

  const done = criteria.filter(c => c.checked).length

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Acceptance Criteria
        </h3>
        <span className="text-xs text-slate-400">{done}/{criteria.length}</span>
      </div>
      <ul className="space-y-1">
        {criteria.map(c => (
          <li key={c.id} className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={c.checked}
              onChange={() => toggle.mutate(c)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 cursor-pointer"
            />
            <span className={`text-sm leading-snug ${c.checked ? 'line-through text-slate-400' : 'text-slate-700'}`}>
              {c.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
