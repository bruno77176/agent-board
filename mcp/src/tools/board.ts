const BASE_URL = process.env.BOARD_URL ?? 'http://localhost:3000'

async function call(path: string, method = 'GET', body?: object): Promise<any> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Board API ${method} ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

export const board = {
  listProjects: () => call('/projects'),
  createProject: (data: object) => call('/projects', 'POST', data),
  getStories: (project_id: string) => call(`/stories?project_id=${project_id}`),
  getStory: (id: string) => call(`/stories/${id}`),
  listAgents: () => call('/agents'),
  listEpics: (project_id: string) => call(`/epics?project_id=${project_id}`),
  createEpic: (data: object) => call('/epics', 'POST', data),
  createFeature: (data: object) => call('/features', 'POST', data),
  createStory: (data: object) => call('/stories', 'POST', data),
  moveStatus: (id: string, status: string, agent_id?: string, comment?: string) =>
    call(`/stories/${id}/status`, 'PATCH', { status, agent_id, comment }),
  updateStory: (id: string, data: object) => call(`/stories/${id}`, 'PATCH', data),
  createEvent: (data: object) => call('/events', 'POST', data),
}
