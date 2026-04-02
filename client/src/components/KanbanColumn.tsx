import { useDroppable } from '@dnd-kit/core'
import type { WorkflowState, Story, Agent } from '@/lib/api'
import { StoryCard } from './StoryCard'

interface Props {
  state: WorkflowState
  stories: Story[]
  agents: Agent[]
  onCardClick: (story: Story) => void
}

export function KanbanColumn({ state, stories, agents, onCardClick }: Props) {
  const agentMap = Object.fromEntries(agents.map(a => [a.id, a]))
  const { setNodeRef, isOver } = useDroppable({ id: state.id })
  return (
    <div className="flex flex-col w-64 flex-shrink-0">
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: state.color }} />
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{state.label}</span>
        <span className="ml-auto text-xs text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5">{stories.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-2 min-h-[40px] rounded-lg transition-colors ${isOver ? 'ring-2 ring-blue-300 ring-inset bg-blue-50/30' : ''}`}
      >
        {stories.map(story => (
          <StoryCard
            key={story.id}
            story={story}
            agent={story.assigned_agent_id ? agentMap[story.assigned_agent_id] : undefined}
            onClick={() => onCardClick(story)}
            hasBlockers={story.links?.some(l => l.link_type === 'blocks' && l.to_story_id === story.id)}
          />
        ))}
      </div>
    </div>
  )
}
