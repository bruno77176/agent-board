const BASE_URL = process.env.BOARD_URL ?? 'http://localhost:3000'
const API_KEY = process.env.MCP_API_KEY

async function call(path: string, method = 'GET', body?: object): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) headers['x-api-key'] = API_KEY
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Board API ${method} ${path} → ${res.status}: ${text}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export const board = {
  listProjects: () => call('/projects'),
  createProject: (data: object) => call('/projects', 'POST', data),
  getStories: (project_id: string) => call(`/stories?project_id=${project_id}`),
  getStory: (id: string) => call(`/stories/${id}`),
  listAgents: () => call('/agents'),
  getAgent: (slug: string) => call(`/agents/${slug}`),
  listEpics: (project_id: string) => call(`/epics?project_id=${project_id}`),
  createEpic: (data: object) => call('/epics', 'POST', data),
  createFeature: (data: object) => call('/features', 'POST', data),
  createStory: (data: object) => call('/stories', 'POST', data),
  moveStatus: (id: string, status: string, agent_id?: string, comment?: string) =>
    call(`/stories/${id}/status`, 'PATCH', { status, agent_id, comment }),
  updateStory: (id: string, data: object) => call(`/stories/${id}`, 'PATCH', data),
  createEvent: (data: object) => call('/events', 'POST', data),
  getEpic: (id: string) => call(`/epics/${id}`),
  getFeature: (id: string) => call(`/features/${id}`),
  listFeatures: (params: { epic_id?: string; project_id?: string }) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v) as [string, string][]
    ).toString()
    return call(`/features?${qs}`)
  },
  getProjectOverview: (id: string) => call(`/projects/${id}/overview`),
  linkStories: (story_id: string, data: { to_story_id: string; link_type: string }) =>
    call(`/stories/${story_id}/links`, 'POST', data),
  getStoryLinks: (story_id: string) => call(`/stories/${story_id}/links`),
  deleteStoryLink: (story_id: string, link_id: string) =>
    call(`/stories/${story_id}/links/${link_id}`, 'DELETE'),
  updateEpic: (id: string, data: object) => call(`/epics/${id}`, 'PATCH', data),
  updateFeature: (id: string, data: object) => call(`/features/${id}`, 'PATCH', data),
  deleteStory: (id: string) => call(`/stories/${id}`, 'DELETE'),
  deleteFeature: (id: string) => call(`/features/${id}`, 'DELETE'),
  deleteEpic: (id: string) => call(`/epics/${id}`, 'DELETE'),
  listStories: (params: { project_id?: string; feature_id?: string; status?: string; agent_id?: string }) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v) as [string, string][]
    ).toString()
    return call(`/stories?${qs}`)
  },
  syncDoc: (content: string) => call('/docs/sync', 'POST', { content }),
  uploadDoc: (docPath: string, content: string) =>
    call('/docs/upload', 'POST', { path: docPath, content }),
}
