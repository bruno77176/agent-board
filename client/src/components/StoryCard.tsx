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
}

export function StoryCard({ story, agent, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow-md hover:border-slate-300 cursor-pointer transition-all"
    >
      <p className="text-sm text-slate-800 font-medium leading-snug mb-2">{story.title}</p>
      {story.tags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap mb-2">
          {story.tags.map(tag => (
            <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{tag}</Badge>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mt-1">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${PRIORITY_COLOR[story.priority] ?? ''}`}>
          {story.priority}
        </span>
        <div className="flex items-center gap-1.5">
          {story.git_branch && (
            <span className="flex items-center gap-0.5 text-[10px] text-slate-400 font-mono">
              <GitBranch className="w-3 h-3" />
              {story.git_branch.split('/').pop()}
            </span>
          )}
          {agent && (
            <Avatar className="h-5 w-5" style={{ border: `1.5px solid ${agent.color}` }}>
              <AvatarFallback style={{ backgroundColor: agent.color + '20', color: agent.color, fontSize: 10 }}>
                {agent.avatar_emoji}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </div>
  )
}
