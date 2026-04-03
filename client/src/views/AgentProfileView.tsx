import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronDown, ChevronRight, Plus, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { Agent, AgentSkill, Story } from '@/lib/api'

const STATUS_COLOR: Record<string, string> = {
  todo: 'bg-slate-100 text-slate-600',
  backlog: 'bg-slate-100 text-slate-500',
  in_progress: 'bg-blue-100 text-blue-700',
  review: 'bg-purple-100 text-purple-700',
  qa: 'bg-amber-100 text-amber-700',
  done: 'bg-green-100 text-green-700',
}

export function AgentProfileView() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { agentSlug } = useParams<{ agentSlug: string }>()

  const { data: agent, isLoading: agentLoading } = useQuery({
    queryKey: ['agent', agentSlug],
    queryFn: () => api.agents.get(agentSlug!),
    enabled: !!agentSlug,
  })

  const { data: stories = [], isLoading: storiesLoading } = useQuery({
    queryKey: ['agent-stories', agentSlug],
    queryFn: () => api.agents.stories(agentSlug!),
    enabled: !!agentSlug,
  })

  const updateAgent = useMutation({
    mutationFn: (skills: AgentSkill[]) => api.agents.update(agentSlug!, { skills }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['agent', agentSlug], updated)
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })

  // Skill editing state
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [editingNameIdx, setEditingNameIdx] = useState<number | null>(null)
  const [addingSkill, setAddingSkill] = useState(false)
  const [newSkillName, setNewSkillName] = useState('')
  const [newSkillContent, setNewSkillContent] = useState('')

  if (agentLoading) {
    return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading…</div>
  }
  if (!agent) {
    return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Agent not found.</div>
  }

  const typedAgent = agent as Agent
  const typedStories = stories as Story[]
  const skills: AgentSkill[] = typedAgent.skills ?? []

  const activeStories = typedStories.filter(s => s.status !== 'done' && s.status !== 'backlog')
  const doneStories = typedStories.filter(s => s.status === 'done')

  function saveSkills(updated: AgentSkill[]) {
    updateAgent.mutate(updated)
  }

  function updateSkillName(idx: number, name: string) {
    const updated = skills.map((s, i) => i === idx ? { ...s, name } : s)
    saveSkills(updated)
  }

  function updateSkillContent(idx: number, content: string) {
    const updated = skills.map((s, i) => i === idx ? { ...s, content } : s)
    saveSkills(updated)
  }

  function deleteSkill(idx: number) {
    saveSkills(skills.filter((_, i) => i !== idx))
    if (expandedIdx === idx) setExpandedIdx(null)
  }

  function addSkill() {
    if (!newSkillName.trim()) return
    saveSkills([...skills, { name: newSkillName.trim(), content: newSkillContent }])
    setNewSkillName('')
    setNewSkillContent('')
    setAddingSkill(false)
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
        <button onClick={() => navigate('/team')} className="text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0"
          style={{ backgroundColor: typedAgent.color + '22' }}
        >
          {typedAgent.avatar_emoji}
        </div>
        <div>
          <h1 className="text-base font-semibold text-slate-800 leading-tight">{typedAgent.name}</h1>
          {typedAgent.scope && <p className="text-xs text-slate-400">{typedAgent.scope}</p>}
        </div>
        <span className="ml-1 text-xs text-slate-300 font-mono">@{typedAgent.slug}</span>
      </div>

      <div className="px-6 py-6 space-y-8 max-w-2xl">

        {/* Skills section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Skills</h3>
            <button
              onClick={() => { setAddingSkill(true); setExpandedIdx(null) }}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors"
            >
              <Plus size={12} /> Add skill
            </button>
          </div>

          {skills.length === 0 && !addingSkill && (
            <p className="text-xs text-slate-300 italic">No skills configured. Add one to equip this agent.</p>
          )}

          <div className="space-y-2">
            {skills.map((skill, idx) => {
              const isExpanded = expandedIdx === idx
              const isEditingName = editingNameIdx === idx
              return (
                <div key={idx} className="border border-slate-200 rounded-lg overflow-hidden">
                  {/* Skill header row */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 group">
                    <button
                      onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                      className="text-slate-400 hover:text-slate-600 shrink-0"
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {isEditingName ? (
                      <input
                        autoFocus
                        value={skill.name}
                        onChange={e => {
                          const updated = skills.map((s, i) => i === idx ? { ...s, name: e.target.value } : s)
                          queryClient.setQueryData(['agent', agentSlug], { ...typedAgent, skills: updated })
                        }}
                        onBlur={e => { updateSkillName(idx, e.target.value); setEditingNameIdx(null) }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        className="flex-1 text-sm font-medium text-slate-700 bg-white border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    ) : (
                      <span
                        onClick={() => setEditingNameIdx(idx)}
                        className="flex-1 text-sm font-medium text-slate-700 cursor-text hover:text-blue-700 truncate"
                        title="Click to rename"
                      >
                        {skill.name}
                      </span>
                    )}
                    <button
                      onClick={() => deleteSkill(idx)}
                      className="text-slate-300 hover:text-red-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={13} />
                    </button>
                  </div>

                  {/* Expanded content editor */}
                  {isExpanded && (
                    <div className="px-3 py-2 border-t border-slate-200">
                      <textarea
                        value={skill.content}
                        onChange={e => {
                          const updated = skills.map((s, i) => i === idx ? { ...s, content: e.target.value } : s)
                          queryClient.setQueryData(['agent', agentSlug], { ...typedAgent, skills: updated })
                        }}
                        onBlur={e => updateSkillContent(idx, e.target.value)}
                        rows={10}
                        placeholder="Paste skill content here…"
                        className="w-full text-xs text-slate-600 font-mono border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-y"
                      />
                      <p className="text-[10px] text-slate-300 mt-1">Changes save on blur</p>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Add skill form */}
            {addingSkill && (
              <div className="border border-blue-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-blue-50 border-b border-blue-200">
                  <input
                    autoFocus
                    value={newSkillName}
                    onChange={e => setNewSkillName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') document.getElementById('new-skill-content')?.focus() }}
                    placeholder="Skill name (e.g. cursor.directory/front-end)"
                    className="w-full text-sm font-medium text-slate-700 bg-white border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
                <div className="px-3 py-2">
                  <textarea
                    id="new-skill-content"
                    value={newSkillContent}
                    onChange={e => setNewSkillContent(e.target.value)}
                    rows={10}
                    placeholder="Paste skill content here…"
                    className="w-full text-xs text-slate-600 font-mono border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-y"
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={() => { setAddingSkill(false); setNewSkillName(''); setNewSkillContent('') }}
                      className="text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={addSkill}
                      disabled={!newSkillName.trim()}
                      className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-700 disabled:opacity-40 transition-colors"
                    >
                      Add skill
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Active stories */}
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Active Stories {activeStories.length > 0 && <span className="text-slate-300 font-normal">({activeStories.length})</span>}
          </h3>
          {storiesLoading ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : activeStories.length === 0 ? (
            <p className="text-xs text-slate-400">No active stories.</p>
          ) : (
            <ul className="space-y-2">
              {activeStories.map(s => (
                <li key={s.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[s.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {s.status.replace('_', ' ')}
                  </span>
                  <span className="text-sm text-slate-700 truncate">{s.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Completed stories */}
        {doneStories.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Completed <span className="text-slate-300 font-normal">({doneStories.length})</span>
            </h3>
            <ul className="space-y-1">
              {doneStories.slice(0, 10).map(s => (
                <li key={s.id} className="text-xs text-slate-400 flex items-center gap-1.5">
                  <span className="text-green-400">✓</span>
                  <span className="truncate">{s.title}</span>
                </li>
              ))}
              {doneStories.length > 10 && (
                <li className="text-xs text-slate-300">+{doneStories.length - 10} more</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
