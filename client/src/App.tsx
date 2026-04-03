import { useState } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from './lib/api'
import type { Project } from './lib/api'
import { useBoard } from './hooks/useBoard'
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

// Layout wrapper that renders Sidebar + main content area
function AppLayout({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="h-screen flex bg-slate-50">
      <Sidebar onCreateClick={onCreateClick} />
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/:projectKey/board" element={<ProjectRoutes view="board" />} />
          <Route path="/:projectKey/backlog" element={<ProjectRoutes view="backlog" />} />
          <Route path="/:projectKey/epics" element={<ProjectRoutes view="epics" />} />
          <Route path="/:projectKey/epics/:epicId" element={<ProjectRoutes view="epicDetail" />} />
          <Route path="/:projectKey/roadmap" element={<ProjectRoutes view="roadmap" />} />
          <Route path="/:projectKey/features/:featureId" element={<ProjectRoutes view="featureDetail" />} />
          <Route path="/:projectKey/stories/:storyId" element={<ProjectRoutes view="story" />} />
          <Route path="/team" element={<TeamView />} />
          <Route path="/team/:agentSlug" element={<AgentProfileView />} />
          <Route path="/docs" element={<DocsView />} />
          <Route path="/:projectKey/docs" element={<ProjectDocsRoute />} />
          <Route path="/" element={<Navigate to="/team" replace />} />
          <Route path="*" element={<WelcomeScreen />} />
        </Routes>
      </main>
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
  if (view === 'backlog') return <BacklogView projectId={project.id} />
  if (view === 'epics') return <EpicsView projectId={project.id} projectKey={project.key} />
  if (view === 'epicDetail') return <EpicDetailView epicId={epicId ?? ''} projectKey={project.key} />
  if (view === 'story') return <StoryDetailView storyId={storyId ?? ''} projectKey={project.key} />
  if (view === 'featureDetail') return <FeatureDetailView featureId={featureId ?? ''} projectKey={projectKey ?? ''} />
  if (view === 'roadmap') return <RoadmapView projectId={project.id} />

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
  useBoard()
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <>
      <AppLayout onCreateClick={() => setCreateOpen(true)} />
      {createOpen && <CreateModal onClose={() => setCreateOpen(false)} />}
    </>
  )
}
