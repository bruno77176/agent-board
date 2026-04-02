import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

const WORKFLOWS = [
  {
    id: 'light',
    name: 'Light',
    states: [
      { id: 'backlog', label: 'Backlog', color: '#94a3b8' },
      { id: 'todo', label: 'To Do', color: '#60a5fa' },
      { id: 'in_progress', label: 'In Progress', color: '#34d399' },
      { id: 'done', label: 'Done', color: '#a78bfa' },
      { id: 'cancelled', label: 'Cancelled', color: '#f87171' },
    ],
    transitions: [
      { from: 'backlog', to: 'todo', label: 'Triage' },
      { from: 'todo', to: 'in_progress', label: 'Start Work' },
      { from: 'in_progress', to: 'done', label: 'Complete' },
      { from: 'done', to: 'todo', label: 'Reopen' },
      { from: 'backlog', to: 'cancelled', label: 'Cancel' },
      { from: 'todo', to: 'cancelled', label: 'Cancel' },
      { from: 'in_progress', to: 'cancelled', label: 'Cancel' },
    ],
  },
  {
    id: 'standard',
    name: 'Standard',
    states: [
      { id: 'backlog', label: 'Backlog', color: '#94a3b8' },
      { id: 'todo', label: 'To Do', color: '#60a5fa' },
      { id: 'in_progress', label: 'In Progress', color: '#34d399' },
      { id: 'review', label: 'Review', color: '#fb923c' },
      { id: 'qa', label: 'QA', color: '#f59e0b' },
      { id: 'done', label: 'Done', color: '#a78bfa' },
      { id: 'cancelled', label: 'Cancelled', color: '#f87171' },
    ],
    transitions: [
      { from: 'backlog', to: 'todo', label: 'Triage' },
      { from: 'todo', to: 'in_progress', label: 'Start Work' },
      { from: 'in_progress', to: 'review', label: 'Request Review' },
      { from: 'review', to: 'qa', label: 'Approve' },
      { from: 'review', to: 'in_progress', label: 'Request Changes' },
      { from: 'qa', to: 'done', label: 'Complete' },
      { from: 'qa', to: 'in_progress', label: 'Fail QA' },
      { from: 'done', to: 'todo', label: 'Reopen' },
      { from: 'backlog', to: 'cancelled', label: 'Cancel' },
      { from: 'todo', to: 'cancelled', label: 'Cancel' },
      { from: 'in_progress', to: 'cancelled', label: 'Cancel' },
    ],
  },
  {
    id: 'full',
    name: 'Full',
    states: [
      { id: 'backlog', label: 'Backlog', color: '#94a3b8' },
      { id: 'todo', label: 'To Do', color: '#60a5fa' },
      { id: 'in_progress', label: 'In Progress', color: '#34d399' },
      { id: 'review', label: 'Review', color: '#fb923c' },
      { id: 'qa', label: 'QA', color: '#f59e0b' },
      { id: 'security', label: 'Security', color: '#ef4444' },
      { id: 'done', label: 'Done', color: '#a78bfa' },
      { id: 'cancelled', label: 'Cancelled', color: '#f87171' },
    ],
    transitions: [
      { from: 'backlog', to: 'todo', label: 'Triage' },
      { from: 'todo', to: 'in_progress', label: 'Start Work' },
      { from: 'in_progress', to: 'review', label: 'Request Review' },
      { from: 'review', to: 'qa', label: 'Approve' },
      { from: 'review', to: 'in_progress', label: 'Request Changes' },
      { from: 'qa', to: 'security', label: 'Pass QA' },
      { from: 'qa', to: 'in_progress', label: 'Fail QA' },
      { from: 'security', to: 'done', label: 'Complete' },
      { from: 'security', to: 'in_progress', label: 'Fail Security' },
      { from: 'done', to: 'todo', label: 'Reopen' },
    ],
  },
]

const AGENTS = [
  { slug: 'pro-ject', name: 'Pro Ject', scope: 'Project management & requirements', color: '#f97316', avatar_emoji: '📋', skills: ['brainstorming', 'writing-plans'] },
  { slug: 'arch-lee', name: 'Arch Lee', scope: 'Architecture & planning', color: '#6366f1', avatar_emoji: '🏛️', skills: ['brainstorming', 'writing-plans', 'dispatching-parallel-agents'] },
  { slug: 'tess-ter', name: 'Tess Ter', scope: 'Testing & QA', color: '#10b981', avatar_emoji: '🧪', skills: ['test-driven-development', 'verification-before-completion'] },
  { slug: 'deb-ugg', name: 'Deb Ugg', scope: 'Debugging', color: '#f59e0b', avatar_emoji: '🐛', skills: ['systematic-debugging'] },
  { slug: 'rev-yu', name: 'Rev Yu', scope: 'Code review', color: '#3b82f6', avatar_emoji: '🔍', skills: ['requesting-code-review', 'receiving-code-review'] },
  { slug: 'dee-ploy', name: 'Dee Ploy', scope: 'Deployment & merge', color: '#8b5cf6', avatar_emoji: '🚀', skills: ['finishing-a-development-branch', 'using-git-worktrees'] },
  { slug: 'dev-in', name: 'Dev In', scope: 'Backend implementation', color: '#64748b', avatar_emoji: '⚙️', skills: ['executing-plans', 'subagent-driven-development'] },
  { slug: 'fron-tina', name: 'Fron Tina', scope: 'Frontend implementation', color: '#ec4899', avatar_emoji: '🎨', skills: ['frontend-design', 'executing-plans'] },
  { slug: 'doc-tor', name: 'Doc Tor', scope: 'Documentation', color: '#0ea5e9', avatar_emoji: '📝', skills: ['doc-coauthoring', 'writing-skills'] },
]

export function seed(db: Database.Database): void {
  const insertWorkflow = db.prepare(
    'INSERT OR IGNORE INTO workflows (id, name, states, transitions) VALUES (?, ?, ?, ?)'
  )
  for (const w of WORKFLOWS) {
    insertWorkflow.run(w.id, w.name, JSON.stringify(w.states), JSON.stringify(w.transitions))
  }

  const insertAgent = db.prepare(
    'INSERT OR IGNORE INTO agents (id, slug, name, scope, color, avatar_emoji, skills) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const updateAgentSkills = db.prepare(
    'UPDATE agents SET skills = ? WHERE slug = ?'
  )
  for (const a of AGENTS) {
    insertAgent.run(randomUUID(), a.slug, a.name, a.scope, a.color, a.avatar_emoji, JSON.stringify(a.skills))
    updateAgentSkills.run(JSON.stringify(a.skills), a.slug)
  }
}
