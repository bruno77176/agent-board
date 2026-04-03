import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '@/lib/api'
import type { Project, Epic, Feature } from '@/lib/api'

type CreateType = 'epic' | 'feature' | 'story'

const TEMPLATES: Record<CreateType, string> = {
  epic: `## Context
[Describe the current situation / problem being solved]

## Objective
[What are we trying to achieve?]

## Value
[Why does it matter? Business impact]

---

## Scope

**In scope:**
-

**Out of scope:**
-

---

## Success Criteria
- [Metric 1]
- [Metric 2]
- [Metric 3]

---

## Stakeholders
- Product:
- Tech:
- Business:  `,

  feature: `## Description
This feature enables: [what it unlocks functionally]

---

## User Value
[Who benefits and how?]

---

## High-Level Acceptance Criteria
- [End-to-end functionality works]
- [Handles key edge cases]
- [Integrated with relevant systems]

---

## Dependencies
- [System / team / API]

---

## Risks / Assumptions
- `,

  story: `## User Story
As a [user/system]
I want [capability]
So that [value]

---

## Acceptance Criteria

### Scenario 1
- Given [context]
- When [action]
- Then [expected result]

---

## Definition of Done
- [ ] Code implemented
- [ ] Tests added (unit / e2e)
- [ ] Code reviewed
- [ ] Deployed / usable`,
}

interface Props { onClose: () => void }

export function CreateModal({ onClose }: Props) {
  const queryClient = useQueryClient()
  const [type, setType] = useState<CreateType>('story')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState(TEMPLATES.story)
  const [projectId, setProjectId] = useState('')
  const [epicId, setEpicId] = useState('')
  const [featureId, setFeatureId] = useState('')
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [estimatedMinutes, setEstimatedMinutes] = useState('')
  const [error, setError] = useState('')

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list })
  const typedProjects = projects as Project[]

  const { data: epics = [] } = useQuery({
    queryKey: ['epics', projectId],
    queryFn: () => api.epics.list(projectId),
    enabled: !!projectId && type !== 'epic',
  })
  const typedEpics = epics as Epic[]

  const { data: features = [] } = useQuery({
    queryKey: ['features', epicId],
    queryFn: () => api.features.list(epicId),
    enabled: !!epicId && type === 'story',
  })
  const typedFeatures = features as Feature[]

  const createEpic = useMutation({
    mutationFn: () => api.epics.create({ project_id: projectId, title, description: description || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['epics', projectId] })
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  const createFeature = useMutation({
    mutationFn: () => api.features.create({ epic_id: epicId, title, description: description || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['features', epicId] })
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  const createStory = useMutation({
    mutationFn: () => api.stories.create({
      feature_id: featureId,
      title,
      description: description || undefined,
      priority,
      estimated_minutes: estimatedMinutes ? Math.max(1, parseInt(estimatedMinutes)) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories', projectId] })
      queryClient.invalidateQueries({ queryKey: ['stories'] })
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!title.trim()) { setError('Title is required'); return }
    if (type === 'epic') {
      if (!projectId) { setError('Select a project'); return }
      createEpic.mutate()
    } else if (type === 'feature') {
      if (!epicId) { setError('Select an epic'); return }
      createFeature.mutate()
    } else {
      if (!featureId) { setError('Select a feature'); return }
      createStory.mutate()
    }
  }

  const isPending = createEpic.isPending || createFeature.isPending || createStory.isPending

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">Create</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Type selector */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
            {(['epic', 'feature', 'story'] as CreateType[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { setType(t); setDescription(TEMPLATES[t]); setError('') }}
                className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors capitalize ${
                  type === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Project selector (epic) or project + epic selector (feature/story) */}
          {(type === 'epic' || type === 'feature' || type === 'story') && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Project</label>
              <select
                value={projectId}
                onChange={e => { setProjectId(e.target.value); setEpicId(''); setFeatureId('') }}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select project…</option>
                {typedProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Epic selector (feature/story) */}
          {(type === 'feature' || type === 'story') && !!projectId && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Epic</label>
              <select
                value={epicId}
                onChange={e => { setEpicId(e.target.value); setFeatureId('') }}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select epic…</option>
                {typedEpics.map(ep => (
                  <option key={ep.id} value={ep.id}>{ep.title}</option>
                ))}
              </select>
            </div>
          )}

          {/* Feature selector (story) */}
          {type === 'story' && !!epicId && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Feature</label>
              <select
                value={featureId}
                onChange={e => setFeatureId(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select feature…</option>
                {typedFeatures.map(f => (
                  <option key={f.id} value={f.id}>{f.title}</option>
                ))}
              </select>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={`${type.charAt(0).toUpperCase() + type.slice(1)} title…`}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={12}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono"
            />
          </div>

          {/* Story-specific fields */}
          {type === 'story' && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value as 'high' | 'medium' | 'low')}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Est. minutes</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={estimatedMinutes}
                  onChange={e => setEstimatedMinutes(e.target.value)}
                  placeholder="10"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && <p className="text-xs text-red-600">{error}</p>}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-500 hover:text-slate-700 px-3 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Creating…' : `Create ${type}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
