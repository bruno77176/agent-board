const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const api = {
  projects: {
    list: () => request<Project[]>('/projects'),
    get: (id: string) => request<Project>(`/projects/${id}`),
    create: (data: Partial<Project>) => request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  },
  agents: {
    list: () => request<Agent[]>('/agents'),
    get: (slug: string) => request<Agent>(`/agents/${slug}`),
    stories: (slug: string) => request<Story[]>(`/agents/${slug}/stories`),
  },
  workflows: {
    list: () => request<Workflow[]>('/workflows'),
  },
  epics: {
    list: (project_id: string) => request<Epic[]>(`/epics?project_id=${project_id}`),
    get: (id: string) => request<Epic>(`/epics/${id}`),
    create: (data: Partial<Epic>) => request<Epic>('/epics', { method: 'POST', body: JSON.stringify(data) }),
  },
  features: {
    list: (epic_id: string) => request<Feature[]>(`/features?epic_id=${epic_id}`),
    create: (data: Partial<Feature>) => request<Feature>('/features', { method: 'POST', body: JSON.stringify(data) }),
  },
  stories: {
    list: (project_id: string) => request<Story[]>(`/stories?project_id=${project_id}`),
    get: (id: string) => request<Story>(`/stories/${id}`),
    create: (data: Partial<Story>) => request<Story>('/stories', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Story>) => request<Story>(`/stories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    moveStatus: (id: string, status: string, agent_id?: string, comment?: string) =>
      request<Story>(`/stories/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, agent_id, comment }) }),
  },
  events: {
    list: (target_id: string, target_type?: string) =>
      request<BoardEvent[]>(`/events?target_id=${target_id}${target_type ? `&target_type=${target_type}` : ''}`),
    create: (data: { target_type: string; target_id: string; agent_id?: string; comment: string }) =>
      request<BoardEvent>('/events', { method: 'POST', body: JSON.stringify(data) }),
  },
}

export interface Project { id: string; key: string; name: string; description?: string; workflow_id: string; created_at: string }
export interface Agent { id: string; slug: string; name: string; scope?: string; color: string; avatar_emoji: string; skills: string[] }
export interface AcceptanceCriterion { id: string; text: string; done: boolean }
export interface WorkflowState { id: string; label: string; color: string }
export interface WorkflowTransition { from: string; to: string; label: string }
export interface Workflow { id: string; name: string; states: WorkflowState[]; transitions: WorkflowTransition[] }
export interface Epic { id: string; project_id: string; title: string; description?: string; version?: string; status: string; created_at: string }
export interface Feature { id: string; epic_id: string; title: string; description?: string; tags: string[]; created_at: string }
export interface Story { id: string; feature_id: string; parent_story_id?: string; title: string; description?: string; status: string; priority: string; assigned_agent_id?: string; tags: string[]; acceptance_criteria: AcceptanceCriterion[]; estimated_minutes?: number; git_branch?: string; events?: BoardEvent[]; created_at: string }
export interface BoardEvent { id: string; target_type: string; target_id: string; agent_id?: string; from_status?: string; to_status?: string; comment?: string; created_at: string }
