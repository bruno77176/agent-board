import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { X, ExternalLink, Pencil } from 'lucide-react'
import { api } from '@/lib/api'
import type { Story, Agent } from '@/lib/api'
import { MarkdownContent } from '@/components/MarkdownContent'
import { AcceptanceCriteria } from '@/components/AcceptanceCriteria'
import type { AcceptanceCriterion } from '@/lib/api'

interface Props {
  storyId: string   // short_id or UUID
  onClose: () => void
}

const STATUS_COLORS: Record<string, string> = {
  backlog: 'bg-slate-100 text-slate-600',
  todo: 'bg-blue-50 text-blue-600',
  in_progress: 'bg-yellow-50 text-yellow-700',
  review: 'bg-purple-50 text-purple-700',
  qa: 'bg-orange-50 text-orange-700',
  done: 'bg-green-50 text-green-700',
  cancelled: 'bg-slate-100 text-slate-400',
}

export function StoryPanel({ storyId, onClose }: Props) {
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: story, isLoading } = useQuery({
    queryKey: ['story', storyId],
    queryFn: () => api.stories.get(storyId),
    enabled: !!storyId,
  })
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: api.agents.list })

  const [editTitle, setEditTitle] = useState('')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editDesc, setEditDesc] = useState('')
  const [isEditingDesc, setIsEditingDesc] = useState(false)
  const [criteria, setCriteria] = useState<AcceptanceCriterion[]>([])

  const typedStory = story as Story | undefined

  useEffect(() => {
    if (typedStory) {
      setEditTitle(typedStory.title)
      setEditDesc(typedStory.description ?? '')
      setCriteria(typedStory.acceptance_criteria ?? [])
    }
  }, [story])

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Story>) => api.stories.update(typedStory!.id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(['story', storyId], updated)
      queryClient.invalidateQueries({ queryKey: ['stories'] })
    },
  })

  const agentMap = Object.fromEntries((agents as Agent[]).map(a => [a.id, a]))
  const assignedAgent = typedStory?.assigned_agent_id ? agentMap[typedStory.assigned_agent_id] : null

  return (
    <div className="w-[440px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col h-full overflow-hidden shadow-lg">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        {typedStory?.short_id && (
          <span className="text-xs font-mono text-slate-400 select-all">{typedStory.short_id}</span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => navigate(`/${projectKey}/stories/${typedStory?.short_id ?? storyId}`)}
          title="Open full page"
          className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100"
        >
          <ExternalLink size={14} />
        </button>
        <button
          onClick={onClose}
          title="Close panel"
          className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100"
        >
          <X size={14} />
        </button>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Loading…</div>
      )}
      {!isLoading && !typedStory && (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Story not found.</div>
      )}

      {typedStory && (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

          {/* Title — inline edit */}
          {isEditingTitle ? (
            <input
              autoFocus
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={() => {
                setIsEditingTitle(false)
                if (editTitle.trim() && editTitle !== typedStory.title)
                  updateMutation.mutate({ title: editTitle.trim() })
              }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              className="w-full text-base font-semibold text-slate-900 border-b-2 border-blue-400 focus:outline-none pb-0.5 bg-transparent"
            />
          ) : (
            <h2
              onClick={() => setIsEditingTitle(true)}
              className="text-base font-semibold text-slate-900 leading-snug cursor-text hover:text-blue-700 transition-colors"
              title="Click to edit"
            >
              {typedStory.title}
            </h2>
          )}

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[typedStory.status] ?? 'bg-slate-100 text-slate-600'}`}>
              {typedStory.status.replace('_', ' ')}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${
              typedStory.priority === 'high' ? 'border-red-200 text-red-600' :
              typedStory.priority === 'medium' ? 'border-amber-200 text-amber-600' :
              'border-slate-200 text-slate-400'
            }`}>{typedStory.priority}</span>
            {assignedAgent && (
              <span className="text-xs text-slate-600 flex items-center gap-1">
                {assignedAgent.avatar_emoji} {assignedAgent.name}
              </span>
            )}
            {typedStory.estimated_minutes != null && (
              <span className="text-xs text-slate-400">{typedStory.estimated_minutes} min</span>
            )}
            {typedStory.tags.map(t => (
              <span key={t} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{t}</span>
            ))}
          </div>

          {/* Description — view/edit toggle */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</p>
              {!isEditingDesc && (
                <button
                  onClick={() => setIsEditingDesc(true)}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                >
                  <Pencil size={11} /> Edit
                </button>
              )}
            </div>
            {isEditingDesc ? (
              <textarea
                autoFocus
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                onBlur={() => {
                  setIsEditingDesc(false)
                  if (editDesc !== (typedStory.description ?? ''))
                    updateMutation.mutate({ description: editDesc })
                }}
                rows={8}
                className="w-full text-sm text-slate-700 border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none font-mono"
              />
            ) : editDesc ? (
              <div
                onClick={() => setIsEditingDesc(true)}
                className="cursor-text rounded-lg border border-transparent hover:border-slate-200 px-1 py-0.5 -mx-1 transition-colors"
              >
                <MarkdownContent>{editDesc}</MarkdownContent>
              </div>
            ) : (
              <button
                onClick={() => setIsEditingDesc(true)}
                className="text-sm text-slate-300 hover:text-slate-500 italic"
              >
                Add a description…
              </button>
            )}
          </div>

          {/* Acceptance Criteria */}
          {criteria.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Acceptance Criteria</p>
              <AcceptanceCriteria
                items={criteria}
                onChange={(items) => {
                  setCriteria(items)
                  updateMutation.mutate({ acceptance_criteria: items })
                }}
              />
            </div>
          )}

          {/* Activity */}
          {typedStory.events && typedStory.events.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Activity</p>
              <div className="space-y-2">
                {typedStory.events.slice(0, 8).map((evt: any) => {
                  const evtAgent = evt.agent_id ? agentMap[evt.agent_id] : null
                  return (
                    <div key={evt.id} className="flex gap-2 text-xs text-slate-500">
                      <span className="flex-shrink-0">{evtAgent ? evtAgent.avatar_emoji : '👤'}</span>
                      <span>
                        <span className="font-medium">{evtAgent ? evtAgent.name : 'System'}</span>
                        {evt.from_status && evt.to_status && (
                          <span className="text-slate-400"> {evt.from_status} → {evt.to_status}</span>
                        )}
                        {evt.comment && <span>: {evt.comment}</span>}
                        <span className="ml-1 text-slate-300">{new Date(evt.created_at).toLocaleDateString()}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
