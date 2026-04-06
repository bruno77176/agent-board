import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from './lib/api'
import type { Project } from './lib/api'
import { useBoard } from './hooks/useBoard'
import { Menu } from 'lucide-react'
import { cn } from './lib/utils'
import { useAuth } from './contexts/AuthContext'
import { Sidebar } from './components/Sidebar'
import { BoardView } from './views/BoardView'
import { BacklogView } from './views/BacklogView'
import { EpicsView } from './views/EpicsView'
import { EpicDetailView } from './views/EpicDetailView'
import { StoryDetailView } from './views/StoryDetailView'
import { FeatureDetailView } from './views/FeatureDetailView'
import { TeamView } from './views/TeamView'
import { AgentProfileView } from './views/AgentProfileView'
import { DocsView } from './views/DocsView'
import { CreateModal } from './components/CreateModal'
import { RoadmapView } from './views/RoadmapView'
import { LoginPage } from './pages/LoginPage'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { PendingBanner } from './components/PendingBanner'
import { ProjectSettings } from './components/ProjectSettings'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <div className="min-h-screen bg-slate-50" />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

// Layout wrapper that renders Sidebar + main content area
function AppLayout({ onCreateClick }: { onCreateClick: () => void }) {
  useBoard()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  // Close sidebar whenever the route changes (user tapped a nav link)
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <PendingBanner />

      {/* Mobile top bar — only visible below md breakpoint */}
      <div className="flex items-center gap-3 px-4 h-12 border-b border-slate-200 bg-white flex-shrink-0 md:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 rounded hover:bg-slate-100"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5 text-slate-600" />
        </button>
        <span className="font-semibold text-sm text-slate-900 tracking-tight">Agent Board</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Mobile backdrop — darkens screen behind open sidebar */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar wrapper — fixed overlay on mobile, normal flex item on desktop */}
        <div className={cn(
          'fixed left-0 top-12 h-[calc(100%-3rem)] z-40 md:relative md:top-0 md:h-full md:z-auto',
          sidebarOpen ? 'block' : 'hidden md:block'
        )}>
          <Sidebar onCreateClick={() => { onCreateClick(); setSidebarOpen(false) }} />
        </div>

        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/:projectKey/board" element={<ProjectRoutes view="board" />} />
            <Route path="/:projectKey/backlog" element={<ProjectRoutes view="backlog" />} />
            <Route path="/:projectKey/epics" element={<ProjectRoutes view="epics" />} />
            <Route path="/:projectKey/epics/:epicId" element={<ProjectRoutes view="epicDetail" />} />
            <Route path="/:projectKey/roadmap" element={<ProjectRoutes view="roadmap" />} />
            <Route path="/:projectKey/settings" element={<ProjectRoutes view="settings" />} />
            <Route path="/:projectKey/features/:featureId" element={<ProjectRoutes view="featureDetail" />} />
            <Route path="/:projectKey/stories/:storyId" element={<ProjectRoutes view="story" />} />
            <Route path="/team" element={<TeamView />} />
            <Route path="/team/:agentSlug" element={<AgentProfileView />} />
            <Route path="/docs" element={<DocsView />} />
            <Route path="/:projectKey/docs" element={<ProjectDocsRoute />} />
            <Route path="/:projectKey/docs/:docSlug" element={<ProjectDocsRoute />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/" element={<Navigate to="/team" replace />} />
            <Route path="*" element={<WelcomeScreen />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

// Resolves projectKey -> projectId and renders the right view
function ProjectRoutes({ view }: { view: string }) {
  const { projectKey, epicId, storyId, featureId } = useParams<{ projectKey: string; epicId: string; storyId: string; featureId: string }>()
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list })
  const project = (projects as Project[]).find(p => p.key === projectKey)

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Loading...
      </div>
    )
  }

  if (view === 'board') return <BoardView projectId={project.id} />
  if (view === 'backlog') return <BacklogView projectId={project.id} projectKey={project.key} />
  if (view === 'epics') return <EpicsView projectId={project.id} projectKey={project.key} />
  if (view === 'epicDetail') return <EpicDetailView epicId={epicId ?? ''} projectKey={project.key} />
  if (view === 'story') return <StoryDetailView storyId={storyId ?? ''} projectKey={project.key} />
  if (view === 'featureDetail') return <FeatureDetailView featureId={featureId ?? ''} projectKey={projectKey ?? ''} />
  if (view === 'roadmap') return <RoadmapView projectId={project.id} />
  if (view === 'settings') return <ProjectSettings project={project} />

  return null
}

function ProjectDocsRoute() {
  const { projectKey } = useParams<{ projectKey: string }>()
  return <DocsView projectKey={projectKey} />
}

function WelcomeScreen() {
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list })
  const firstProject = (projects as Project[])[0]

  if (firstProject) {
    return <Navigate to={`/${firstProject.key}/board`} replace />
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <p className="text-slate-400 text-sm mb-1">No projects found</p>
        <p className="text-slate-300 text-xs">Create a project via MCP to get started</p>
      </div>
    </div>
  )
}

export default function App() {
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={
        <ProtectedRoute>
          <>
            <AppLayout onCreateClick={() => setCreateOpen(true)} />
            {createOpen && <CreateModal onClose={() => setCreateOpen(false)} />}
          </>
        </ProtectedRoute>
      } />
    </Routes>
  )
}
