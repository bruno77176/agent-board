import { useDraggable } from '@dnd-kit/core'
import { useNavigate } from 'react-router-dom'
import type { Story, Agent } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { GitBranch } from 'lucide-react'

const PRIORITY_COLOR: Record<string, string> = {
  high: 'text-red-600 bg-red-50 border-red-200',
  medium: 'text-amber-600 bg-amber-50 border-amber-200',
  low: 'text-slate-500 bg-slate-50 border-slate-200',
}

interface Props {
  story: Story
  agent?: Agent
  onClick?: () => void
  hasBlockers?: boolean
}

export function StoryCard({ story, agent, onClick, hasBlockers }: Props) {
  const navigate = useNavigate()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: story.id,
    data: { story },
  })
  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  } : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      {...listeners}
      {...attributes}
      className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow-md hover:border-slate-300 cursor-pointer transition-all"
    >
      {story.short_id && (
        <p className="text-[10px] font-mono text-slate-400 mb-1">{story.short_id}</p>
      )}
      <p className="text-sm text-slate-800 font-medium leading-snug mb-2">{story.title}</p>
      {story.tags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap mb-2">
          {story.tags.map(tag => (
            <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{tag}</Badge>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-1">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${PRIORITY_COLOR[story.priority] ?? ''}`}>
            {story.priority}
          </span>
          {hasBlockers && (
            <span title="Has blockers" className="text-[10px] text-red-500">⛔</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {story.git_branch && (
            <span className="flex items-center gap-0.5 text-[10px] text-slate-400 font-mono">
              <GitBranch className="w-3 h-3" />
              {story.git_branch.split('/').pop()}
            </span>
          )}
          {agent && (
            <button
              onClick={e => { e.stopPropagation(); navigate(`/team/${agent.slug}`) }}
              className="flex-shrink-0 hover:opacity-70 transition-opacity"
              title={agent.name}
            >
              <Avatar className="h-5 w-5" style={{ border: `1.5px solid ${agent.color}` }}>
                <AvatarFallback style={{ backgroundColor: agent.color + '20', color: agent.color, fontSize: 10 }}>
                  {agent.avatar_emoji}
                </AvatarFallback>
              </Avatar>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
