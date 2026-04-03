const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
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
    update: (slug: string, data: Partial<Pick<Agent, 'name' | 'scope' | 'color' | 'avatar_emoji' | 'skills'>>) =>
      request<Agent>(`/agents/${slug}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },
  workflows: {
    list: () => request<Workflow[]>('/workflows'),
  },
  epics: {
    list: (project_id: string) => request<Epic[]>(`/epics?project_id=${project_id}`),
    get: (id: string) => request<Epic>(`/epics/${id}`),
    create: (data: Partial<Epic>) => request<Epic>('/epics', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Epic>) =>
      request<Epic>(`/epics/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },
  features: {
    list: (epic_id: string) => request<Feature[]>(`/features?epic_id=${epic_id}`),
    listAll: () => request<Feature[]>('/features'),
    get: (id: string) => request<Feature>(`/features/${id}`),
    create: (data: Partial<Feature>) => request<Feature>('/features', { method: 'POST', body: JSON.stringify(data) }),
  },
  stories: {
    list: (project_id: string) => request<Story[]>(`/stories?project_id=${project_id}`),
    listByFeature: (feature_id: string) => request<Story[]>(`/stories?feature_id=${feature_id}`),
    get: (id: string) => request<Story>(`/stories/${id}`),
    create: (data: Partial<Story>) => request<Story>('/stories', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Story>) => request<Story>(`/stories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    moveStatus: (id: string, status: string, agent_id?: string, comment?: string) =>
      request<Story>(`/stories/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, agent_id, comment }) }),
    links: {
      list: (story_id: string) => request<StoryLink[]>(`/stories/${story_id}/links`),
      create: (story_id: string, data: { to_story_id: string; link_type: string }) =>
        request<StoryLink>(`/stories/${story_id}/links`, { method: 'POST', body: JSON.stringify(data) }),
      delete: (story_id: string, link_id: string) =>
        request<void>(`/stories/${story_id}/links/${link_id}`, { method: 'DELETE' }),
    },
  },
  events: {
    list: (target_id: string, target_type?: string) =>
      request<BoardEvent[]>(`/events?target_id=${target_id}${target_type ? `&target_type=${target_type}` : ''}`),
    create: (data: { target_type: string; target_id: string; agent_id?: string; comment: string }) =>
      request<BoardEvent>('/events', { method: 'POST', body: JSON.stringify(data) }),
  },
}

export interface Project { id: string; key: string; name: string; description?: string; workflow_id: string; is_public: number; created_at: string }
export interface AgentSkill { name: string; content: string }
export interface Agent { id: string; slug: string; name: string; scope?: string; color: string; avatar_emoji: string; skills: AgentSkill[] }
export interface AcceptanceCriterion { id: string; text: string; checked: boolean }
export interface WorkflowState { id: string; label: string; color: string }
export interface WorkflowTransition { from: string; to: string; label: string }
export interface Workflow { id: string; name: string; states: WorkflowState[]; transitions: WorkflowTransition[] }
export interface Epic { id: string; project_id: string; title: string; description?: string; version?: string; status: string; created_at: string; short_id?: string; start_date?: string | null; end_date?: string | null }
export interface Feature { id: string; epic_id: string; title: string; description?: string; tags: string[]; created_at: string; short_id?: string }
export interface StoryLink {
  id: string
  from_story_id: string
  to_story_id: string
  link_type: 'blocks' | 'duplicates' | 'relates_to'
  created_at: string
}
export interface Story { id: string; feature_id: string; parent_story_id?: string; title: string; description?: string; status: string; priority: string; assigned_agent_id?: string; tags: string[]; acceptance_criteria: AcceptanceCriterion[]; estimated_minutes?: number; git_branch?: string; events?: BoardEvent[]; links?: StoryLink[]; created_at: string; short_id?: string }
export interface BoardEvent { id: string; target_type: string; target_id: string; agent_id?: string; from_status?: string; to_status?: string; comment?: string; created_at: string }

// ─── Auth Types & API ─────────────────────────────────────────────────────────

export interface User {
  id: number
  email: string
  name: string
  avatar_url: string | null
  provider: 'google' | 'github'
  role: 'admin' | 'member'
  status: 'pending' | 'active'
  created_at: string
}

export const authApi = {
  me: (): Promise<User> =>
    fetch('/api/auth/me', { credentials: 'include' }).then(r => {
      if (!r.ok) throw new Error('Not authenticated')
      return r.json()
    }),

  logout: (): Promise<void> =>
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(() => {}),
}

export const adminApi = {
  listUsers: (): Promise<User[]> =>
    fetch('/api/admin/users', { credentials: 'include' }).then(r => r.json()),

  approveUser: (id: number, data: { status?: string; role?: string }): Promise<User> =>
    fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    }).then(r => r.json()),

  pendingCount: (): Promise<{ count: number }> =>
    fetch('/api/admin/users/pending-count', { credentials: 'include' }).then(r => r.json()),
}

export const membersApi = {
  list: (projectId: string): Promise<User[]> =>
    fetch(`/api/projects/${projectId}/members`, { credentials: 'include' }).then(r => r.json()),

  add: (projectId: string, email: string): Promise<void> =>
    fetch(`/api/projects/${projectId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email }),
    }).then(r => { if (!r.ok) throw new Error('Failed to add member') }),

  remove: (projectId: string, userId: number): Promise<void> =>
    fetch(`/api/projects/${projectId}/members/${userId}`, {
      method: 'DELETE',
      credentials: 'include',
    }).then(() => {}),
}
