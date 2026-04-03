import { NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Project } from '@/lib/api'
import { LayoutDashboard, List, BookOpen, Users, Plus, Map, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UserNav } from './UserNav'

interface SidebarProps {
  onCreateClick: () => void
}

export function Sidebar({ onCreateClick }: SidebarProps) {
  const location = useLocation()
  const firstSegment = location.pathname.split('/')[1] || ''
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list })
  const project = (projects as Project[]).find(p => p.key === firstSegment)

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors',
      isActive
        ? 'bg-slate-100 text-slate-900 font-medium'
        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
    )

  return (
    <aside className="w-52 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col h-full">
      {/* App title */}
      <div className="h-12 flex items-center px-4 border-b border-slate-200 flex-shrink-0">
        <span className="font-semibold text-sm text-slate-900 tracking-tight">Agent Board</span>
      </div>

      {/* Project list / selector */}
      <div className="px-3 pt-4 pb-2">
        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold px-1 mb-2">Projects</p>
        {(projects as Project[]).map(p => (
          <NavLink
            key={p.id}
            to={`/${p.key}/board`}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors mb-0.5',
                isActive || p.key === firstSegment
                  ? 'bg-slate-100 text-slate-900 font-medium'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              )
            }
          >
            <span className="font-mono font-semibold text-slate-400">{p.key}</span>
            <span className="truncate">{p.name}</span>
          </NavLink>
        ))}
      </div>

      {/* Views for selected project */}
      {project && (
        <>
          <div className="px-3 pt-2 pb-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold px-1 mb-2">Views</p>
            <NavLink to={`/${project.key}/board`} className={navLinkClass}>
              <LayoutDashboard className="w-3.5 h-3.5" />
              Board
            </NavLink>
            <NavLink to={`/${project.key}/backlog`} className={navLinkClass}>
              <List className="w-3.5 h-3.5" />
              Backlog
            </NavLink>
            <NavLink to={`/${project.key}/epics`} className={navLinkClass}>
              <BookOpen className="w-3.5 h-3.5" />
              Epics
            </NavLink>
            <NavLink to={`/${project.key}/roadmap`} className={navLinkClass}>
              <Map className="w-3.5 h-3.5" />
              Roadmap
            </NavLink>
            <NavLink to={`/${project.key}/docs`} className={navLinkClass}>
              <FileText className="w-3.5 h-3.5" />
              Superpowers Docs
            </NavLink>
          </div>
        </>
      )}

      {/* Global views */}
      <div className="px-3 pt-2 pb-2 border-t border-slate-100 mt-auto">
        <NavLink to="/team" className={navLinkClass}>
          <Users className="w-3.5 h-3.5" />
          Team
        </NavLink>
      </div>

      {/* Create button */}
      <div className="px-3 pb-4">
        <button
          onClick={onCreateClick}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Create
        </button>
      </div>

      <UserNav />
    </aside>
  )
}
