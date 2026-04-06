import { useState } from 'react'
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Story, Workflow, Project, Agent, Epic, Feature } from '@/lib/api'
import { KanbanColumn } from '@/components/KanbanColumn'
import { FilterBar, defaultFilters } from '@/components/FilterBar'
import type { Filters } from '@/components/FilterBar'

type View = 'board' | 'list'
type Swimlane = 'none' | 'epic' | 'assignee' | 'priority'

interface Props { projectId: string }

export function BoardView({ projectId }: Props) {
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [view, setView] = useState<View>('board')
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [swimlane, setSwimlane] = useState<Swimlane>('none')
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const { data: stories = [] } = useQuery({
    queryKey: ['stories', projectId],
    queryFn: () => api.stories.list(projectId),
    enabled: !!projectId,
  })

  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: api.agents.list })
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list })
  const { data: workflows = [] } = useQuery({ queryKey: ['workflows'], queryFn: api.workflows.list })
  const { data: epics = [] } = useQuery({
    queryKey: ['epics', projectId],
    queryFn: () => api.epics.list(projectId),
    enabled: !!projectId,
  })

  const { data: features = [], isLoading: featuresLoading } = useQuery({
    queryKey: ['features', projectId],
    queryFn: () => api.features.listAll(),
    enabled: swimlane === 'epic' && !!projectId,
  })
  // Build feature -> epic lookup; null signals "still loading for epic swimlane"
  const featureToEpicId: Record<string, string> | null =
    swimlane === 'epic' && featuresLoading
      ? null
      : Object.fromEntries((features as Feature[]).map(f => [f.id, f.epic_id]))

  const moveMutation = useMutation({
    mutationFn: ({ storyId, status }: { storyId: string; status: string }) =>
      api.stories.moveStatus(storyId, status),
    onMutate: async ({ storyId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['stories', projectId] })
      const prev = queryClient.getQueryData(['stories', projectId])
      queryClient.setQueryData(['stories', projectId], (old: any[]) =>
        old?.map(s => s.id === storyId ? { ...s, status } : s) ?? old
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(['stories', projectId], ctx?.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['stories', projectId] })
    },
  })

  const project = (projects as Project[]).find(p => p.id === projectId)
  const workflow = (workflows as Workflow[]).find(w => w.id === project?.workflow_id)

  if (!workflow) return (
    <div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading board...</div>
  )

  const typedAgents = agents as Agent[]
  const typedEpics = epics as Epic[]
  const typedStories = stories as Story[]
  const agentMap = Object.fromEntries(typedAgents.map(a => [a.id, a]))

  // Apply filters
  const filteredStories = typedStories.filter(s => {
    if (filters.assignees.length > 0 && (!s.assigned_agent_id || !filters.assignees.includes(s.assigned_agent_id))) return false
    if (filters.priorities.length > 0 && !filters.priorities.includes(s.priority)) return false
    if (filters.tags.length > 0 && !s.tags.some(t => filters.tags.includes(t))) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      if (!s.title.toLowerCase().includes(q) && !(s.description ?? '').toLowerCase().includes(q) && !(s.short_id ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const story = typedStories.find(s => s.id === active.id)
    if (!story || story.status === over.id) return
    moveMutation.mutate({ storyId: story.id as string, status: over.id as string })
  }

  const handleStoryClick = (story: Story) => {
    navigate(`/${projectKey ?? ''}/stories/${story.short_id ?? story.id}`)
  }

  function groupStories(storiesToGroup: Story[], lane: Swimlane): Array<{ key: string; label: string; stories: Story[] }> {
    if (lane === 'none') return [{ key: 'all', label: '', stories: storiesToGroup }]

    if (lane === 'priority') {
      return ['high', 'medium', 'low']
        .map(p => ({ key: p, label: p.charAt(0).toUpperCase() + p.slice(1) + ' Priority', stories: storiesToGroup.filter(s => s.priority === p) }))
        .filter(g => g.stories.length > 0)
    }

    if (lane === 'assignee') {
      const groups = typedAgents
        .map(a => ({ key: a.id, label: `${a.avatar_emoji} ${a.name}`, stories: storiesToGroup.filter(s => s.assigned_agent_id === a.id) }))
        .filter(g => g.stories.length > 0)
      const unassigned = storiesToGroup.filter(s => !s.assigned_agent_id)
      return [...groups, ...(unassigned.length > 0 ? [{ key: 'unassigned', label: 'Unassigned', stories: unassigned }] : [])]
    }

    if (lane === 'epic') {
      if (featureToEpicId === null) return [] // still loading
      const epicGroups = typedEpics
        .map(e => ({ key: e.id, label: `${e.short_id ?? ''} ${e.title}`.trim(), stories: storiesToGroup.filter(s => featureToEpicId[s.feature_id] === e.id) }))
        .filter(g => g.stories.length > 0)
      const noEpic = storiesToGroup.filter(s => !featureToEpicId[s.feature_id])
      return [...epicGroups, ...(noEpic.length > 0 ? [{ key: 'no-epic', label: 'No Epic', stories: noEpic }] : [])]
    }

    return [{ key: 'all', label: '', stories: storiesToGroup }]
  }

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3 px-3 md:px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0">
      <div className="flex items-center gap-1">
        {(['board', 'list'] as View[]).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-3 py-1 text-xs rounded capitalize transition-colors ${
              view === v ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {v}
          </button>
        ))}
      </div>
      {view === 'board' && (
        <div className="flex items-center gap-1 ml-3 pl-3 border-l border-slate-200">
          <span className="text-xs text-slate-400 mr-1">Group:</span>
          {(['none', 'epic', 'assignee', 'priority'] as Swimlane[]).map(s => (
            <button key={s} onClick={() => setSwimlane(s)}
              className={`px-2 py-1 text-xs rounded capitalize transition-colors ${
                swimlane === s ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {s === 'none' ? 'None' : s}
            </button>
          ))}
        </div>
      )}
      <FilterBar agents={typedAgents} epics={typedEpics} features={features as Feature[]} filters={filters} onChange={setFilters} />
    </div>
  )

  if (view === 'board') {
    if (swimlane === 'epic' && featureToEpicId === null) {
      return (
        <div className="h-full flex flex-col">
          {toolbar}
          <div className="p-6 text-slate-400 text-sm">Loading...</div>
        </div>
      )
    }
    const groups = groupStories(filteredStories, swimlane)
    return (
      <div className="h-full flex flex-col">
        {toolbar}
        <div className="flex-1 overflow-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            {groups.map(group => (
              <div key={group.key}>
                {swimlane !== 'none' && group.label && (
                  <div className="px-6 pt-5 pb-1">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{group.label}</span>
                    <span className="text-xs text-slate-400 ml-2">({group.stories.length})</span>
                  </div>
                )}
                <div className="flex gap-5 px-6 pb-6 min-w-max items-start">
                  {workflow.states.map(state => (
                    <KanbanColumn
                      key={`${group.key}-${state.id}`}
                      state={state}
                      stories={group.stories.filter(s => s.status === state.id)}
                      agents={typedAgents}
                      onCardClick={handleStoryClick}
                    />
                  ))}
                </div>
              </div>
            ))}
          </DndContext>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="h-full flex flex-col">
      {toolbar}
      <div className="flex-1 overflow-y-auto px-6 pt-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-xs text-slate-500 uppercase tracking-wide">
              <th className="text-left pb-3 font-semibold">Title</th>
              <th className="text-left pb-3 font-semibold">Status</th>
              <th className="text-left pb-3 font-semibold">Priority</th>
              <th className="text-left pb-3 font-semibold">Agent</th>
            </tr>
          </thead>
          <tbody>
            {filteredStories.map(s => {
              const agent = s.assigned_agent_id ? agentMap[s.assigned_agent_id] : null
              const state = workflow.states.find(st => st.id === s.status)
              return (
                <tr key={s.id} className="border-b hover:bg-slate-50 cursor-pointer"
                  onClick={() => handleStoryClick(s)}>
                  <td className="py-2.5">
                    {s.short_id && <span className="text-[10px] font-mono text-slate-400 mr-2">{s.short_id}</span>}
                    <span className="font-medium text-slate-800">{s.title}</span>
                  </td>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: state?.color }} />
                      {state?.label ?? s.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-xs text-slate-500 capitalize">{s.priority}</td>
                  <td className="py-2.5 text-xs text-slate-500">
                    {agent ? (
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/team/${agent.slug}`) }}
                        className="hover:underline hover:text-slate-900 transition-colors text-left"
                        title={`Go to ${agent.name}'s profile`}
                      >
                        {agent.avatar_emoji} {agent.name}
                      </button>
                    ) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
