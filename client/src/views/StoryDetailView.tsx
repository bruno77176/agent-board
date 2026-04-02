import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Story, Agent, AcceptanceCriterion, StoryLink, Project } from '@/lib/api'
import { AcceptanceCriteria } from '@/components/AcceptanceCriteria'
import { ArrowLeft } from 'lucide-react'

interface Props { storyId?: string; projectKey?: string }

function LinkedIssuesSection({ storyId, links, projectId }: { storyId: string; links: StoryLink[]; projectId: string }) {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [linkType, setLinkType] = useState<'blocks' | 'duplicates' | 'relates_to'>('blocks')

  const { data: allStories = [] } = useQuery({
    queryKey: ['stories', projectId],
    queryFn: () => api.stories.list(projectId),
    enabled: !!projectId,
  })

  const createLink = useMutation({
    mutationFn: (data: { to_story_id: string; link_type: string }) =>
      api.stories.links.create(storyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['story'] })
      setShowAdd(false)
      setSearch('')
    },
  })

  const deleteLink = useMutation({
    mutationFn: (link_id: string) => api.stories.links.delete(storyId, link_id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['story'] }),
  })

  const grouped = {
    'Blocks': links.filter(l => l.link_type === 'blocks' && l.from_story_id === storyId),
    'Blocked by': links.filter(l => l.link_type === 'blocks' && l.to_story_id === storyId),
    'Duplicates': links.filter(l => l.link_type === 'duplicates'),
    'Relates to': links.filter(l => l.link_type === 'relates_to'),
  }

  const searchResults = (allStories as Story[]).filter(s =>
    s.id !== storyId &&
    (s.short_id?.toLowerCase().includes(search.toLowerCase()) ||
     s.title.toLowerCase().includes(search.toLowerCase()))
  ).slice(0, 8)

  const getLinkedStory = (id: string) => (allStories as Story[]).find(s => s.id === id)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Linked Issues</p>
        <button onClick={() => setShowAdd(v => !v)}
          className="text-xs text-blue-600 hover:text-blue-800">+ Add link</button>
      </div>

      {showAdd && (
        <div className="mb-3 p-3 border border-slate-200 rounded-lg bg-slate-50 space-y-2">
          <select value={linkType} onChange={e => setLinkType(e.target.value as 'blocks' | 'duplicates' | 'relates_to')}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1">
            <option value="blocks">Blocks</option>
            <option value="duplicates">Duplicates</option>
            <option value="relates_to">Relates to</option>
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by short ID or title..."
            className="w-full text-xs border border-slate-200 rounded px-2 py-1" />
          {search && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {searchResults.map(s => (
                <button key={s.id} onClick={() => createLink.mutate({ to_story_id: s.id, link_type: linkType })}
                  className="w-full text-left text-xs px-2 py-1.5 hover:bg-white rounded border border-transparent hover:border-slate-200">
                  <span className="font-mono text-slate-400 mr-1">{s.short_id}</span>{s.title}
                </button>
              ))}
              {searchResults.length === 0 && <p className="text-xs text-slate-400 px-2">No stories found</p>}
            </div>
          )}
        </div>
      )}

      {Object.entries(grouped).map(([label, groupLinks]) =>
        groupLinks.length > 0 ? (
          <div key={label} className="mb-2">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{label}</p>
            {groupLinks.map(link => {
              const otherId = link.from_story_id === storyId ? link.to_story_id : link.from_story_id
              const other = getLinkedStory(otherId)
              return (
                <div key={link.id} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-slate-50">
                  <span>
                    <span className="font-mono text-slate-400 mr-1">{other?.short_id ?? otherId.slice(0, 8)}</span>
                    <span className="text-slate-700">{other?.title ?? 'Unknown story'}</span>
                  </span>
                  <button onClick={() => deleteLink.mutate(link.id)}
                    className="text-slate-300 hover:text-red-400 ml-2 text-base leading-none">×</button>
                </div>
              )
            })}
          </div>
        ) : null
      )}

      {links.length === 0 && !showAdd && (
        <p className="text-xs text-slate-400">No linked issues.</p>
      )}
    </div>
  )
}

export function StoryDetailView({ storyId: propStoryId, projectKey: propKey }: Props) {
  const { storyId: paramStoryId, projectKey: paramKey } = useParams<{ storyId: string; projectKey: string }>()
  const storyId = propStoryId ?? paramStoryId
  const projectKey = propKey ?? paramKey
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: story, isLoading } = useQuery({
    queryKey: ['story', storyId],
    queryFn: () => api.stories.get(storyId!),
    enabled: !!storyId,
  })
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: api.agents.list })

  // Resolve projectId from projectKey
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list })
  const resolvedProject = (projects as Project[]).find(p => p.key === projectKey)
  const projectId = resolvedProject?.id ?? ''

  const typedStoryForFeature = story as Story | undefined
  const { data: feature } = useQuery({
    queryKey: ['feature', typedStoryForFeature?.feature_id],
    queryFn: () => api.features.get(typedStoryForFeature!.feature_id),
    enabled: !!typedStoryForFeature?.feature_id,
  })
  const { data: epic } = useQuery({
    queryKey: ['epic', (feature as any)?.epic_id],
    queryFn: () => api.epics.get((feature as any).epic_id),
    enabled: !!(feature as any)?.epic_id,
  })

  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [criteria, setCriteria] = useState<AcceptanceCriterion[]>([])

  useEffect(() => {
    if (story) {
      const s = story as Story
      setEditTitle(s.title)
      setEditDesc(s.description ?? '')
      setCriteria(s.acceptance_criteria ?? [])
    }
  }, [story])

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Story>) => api.stories.update(storyId!, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(['story', storyId], updated)
      queryClient.invalidateQueries({ queryKey: ['stories'] })
    },
  })

  if (isLoading) return <div className="p-8 text-slate-400 text-sm">Loading…</div>
  if (!story) return <div className="p-8 text-slate-400 text-sm">Story not found.</div>

  const typedStory = story as Story
  const agentMap = Object.fromEntries((agents as Agent[]).map(a => [a.id, a]))
  const assignedAgent = typedStory.assigned_agent_id ? agentMap[typedStory.assigned_agent_id] : null

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6">
        <button onClick={() => projectKey ? navigate(`/${projectKey}/backlog`) : navigate(-1)}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mb-4">
          <ArrowLeft size={12} /> Back
        </button>

        {/* Epic › Feature breadcrumb */}
        {(epic || feature) && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
            {epic && (
              <button
                onClick={() => navigate(`/${projectKey}/epics/${(epic as any).id}`)}
                className="font-medium text-slate-500 hover:text-blue-600"
              >
                {(epic as any).title}
              </button>
            )}
            {epic && feature && <span>›</span>}
            {feature && (
              <button
                onClick={() => navigate(`/${projectKey}/features/${(feature as any).short_id ?? (feature as any).id}`)}
                className="hover:text-blue-600"
              >
                {(feature as any).title}
              </button>
            )}
          </div>
        )}
        {typedStory.short_id && (
          <p className="text-xs font-mono text-slate-400 mb-1">{typedStory.short_id}</p>
        )}

        <div className="grid grid-cols-3 gap-8">
          {/* Left: main content */}
          <div className="col-span-2 space-y-6">
            {/* Title — inline edit */}
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={() => { if (editTitle !== typedStory.title) updateMutation.mutate({ title: editTitle }) }}
              className="w-full text-xl font-semibold text-slate-900 border-0 border-b-2 border-transparent focus:border-blue-400 focus:outline-none pb-1 bg-transparent"
            />

            {/* Description — inline edit */}
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Description</h3>
              <textarea
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                onBlur={() => { if (editDesc !== (typedStory.description ?? '')) updateMutation.mutate({ description: editDesc }) }}
                rows={4}
                placeholder="Add a description…"
                className="w-full text-sm text-slate-700 border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
              />
            </div>

            {/* Acceptance criteria */}
            <AcceptanceCriteria
              items={criteria}
              onChange={(items) => {
                setCriteria(items)
                updateMutation.mutate({ acceptance_criteria: items })
              }}
            />

            {/* Linked Issues */}
            <LinkedIssuesSection storyId={typedStory.id} links={typedStory.links ?? []} projectId={projectId} />

            {/* Activity */}
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Activity</h3>
              <div className="space-y-2">
                {(typedStory.events ?? []).map((evt: any) => {
                  const evtAgent = evt.agent_id ? agentMap[evt.agent_id] : null
                  return (
                    <div key={evt.id} className="flex gap-3 text-xs text-slate-500">
                      <span className="flex-shrink-0">{evtAgent ? evtAgent.avatar_emoji : '👤'}</span>
                      <span>
                        <span className="font-medium">{evtAgent ? evtAgent.name : 'System'}</span>
                        {evt.from_status && evt.to_status && (
                          <span className="text-slate-400"> moved {evt.from_status} → {evt.to_status}</span>
                        )}
                        {evt.comment && <span>: {evt.comment}</span>}
                        <span className="ml-2 text-slate-300">{new Date(evt.created_at).toLocaleDateString()}</span>
                      </span>
                    </div>
                  )
                })}
                {!typedStory.events?.length && <p className="text-xs text-slate-300 italic">No activity yet.</p>}
              </div>
            </div>
          </div>

          {/* Right: metadata panel */}
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-4 space-y-4">
              {/* Status */}
              <div>
                <p className="text-xs text-slate-400 mb-1">Status</p>
                <span className="inline-block px-2 py-1 bg-white border border-slate-200 rounded text-xs text-slate-700 capitalize">
                  {typedStory.status}
                </span>
              </div>

              {/* Assignee */}
              <div>
                <p className="text-xs text-slate-400 mb-1">Assignee</p>
                {assignedAgent ? (
                  <button
                    onClick={() => navigate(`/team/${assignedAgent.slug}`)}
                    className="flex items-center gap-2 hover:text-blue-600 text-left"
                  >
                    <span>{assignedAgent.avatar_emoji}</span>
                    <span className="text-sm">{assignedAgent.name}</span>
                  </button>
                ) : (
                  <span className="text-xs text-slate-300">Unassigned</span>
                )}
              </div>

              {/* Priority */}
              <div>
                <p className="text-xs text-slate-400 mb-1">Priority</p>
                <select
                  value={typedStory.priority}
                  onChange={e => updateMutation.mutate({ priority: e.target.value })}
                  className="text-xs border border-slate-200 rounded px-2 py-1 bg-white capitalize"
                >
                  {['high', 'medium', 'low'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {/* Estimate */}
              {typedStory.estimated_minutes != null && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Estimate</p>
                  <span className="text-xs text-slate-600">{typedStory.estimated_minutes} min</span>
                </div>
              )}

              {/* Labels */}
              {typedStory.tags.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Labels</p>
                  <div className="flex flex-wrap gap-1">
                    {typedStory.tags.map(t => (
                      <span key={t} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Branch */}
              {typedStory.git_branch && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Branch</p>
                  <span className="text-xs font-mono text-slate-600">{typedStory.git_branch}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
