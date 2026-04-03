import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import os from 'os'

/** Read a superpowers SKILL.md by name. Returns empty string if not found. */
function readSuperpowersSkill(skillName: string): string {
  const base = path.join(os.homedir(), '.claude', 'plugins', 'cache', 'claude-plugins-official', 'superpowers')
  if (!fs.existsSync(base)) return ''
  // Find the latest version directory
  const versions = fs.readdirSync(base).sort().reverse()
  for (const version of versions) {
    const skillPath = path.join(base, version, 'skills', skillName, 'SKILL.md')
    if (fs.existsSync(skillPath)) return fs.readFileSync(skillPath, 'utf-8')
  }
  return ''
}

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

function sp(name: string) { return { name, content: '' } }

const AGENTS = [
  { slug: 'pro-ject',  name: 'Pro Ject',  scope: 'Project management & requirements', color: '#f97316', avatar_emoji: '📋', skills: [sp('superpowers:brainstorming'), sp('superpowers:writing-plans')] },
  { slug: 'arch-lee',  name: 'Arch Lee',  scope: 'Architecture & planning',           color: '#6366f1', avatar_emoji: '🏛️', skills: [sp('superpowers:brainstorming'), sp('superpowers:writing-plans'), sp('superpowers:dispatching-parallel-agents')] },
  { slug: 'tess-ter',  name: 'Tess Ter',  scope: 'Testing & QA',                      color: '#10b981', avatar_emoji: '🧪', skills: [sp('superpowers:test-driven-development'), sp('superpowers:verification-before-completion')] },
  { slug: 'deb-ugg',   name: 'Deb Ugg',   scope: 'Debugging',                         color: '#f59e0b', avatar_emoji: '🐛', skills: [sp('superpowers:systematic-debugging')] },
  { slug: 'rev-yu',    name: 'Rev Yu',    scope: 'Code review',                       color: '#3b82f6', avatar_emoji: '🔍', skills: [sp('superpowers:requesting-code-review'), sp('superpowers:receiving-code-review')] },
  { slug: 'dee-ploy',  name: 'Dee Ploy',  scope: 'Deployment & merge',                color: '#8b5cf6', avatar_emoji: '🚀', skills: [sp('superpowers:finishing-a-development-branch'), sp('superpowers:using-git-worktrees')] },
  { slug: 'dev-in',    name: 'Dev In',    scope: 'Backend implementation',            color: '#64748b', avatar_emoji: '⚙️', skills: [sp('superpowers:executing-plans'), sp('superpowers:subagent-driven-development')] },
  { slug: 'fron-tina', name: 'Fron Tina', scope: 'Frontend implementation',           color: '#ec4899', avatar_emoji: '🎨', skills: [sp('superpowers:frontend-design'), sp('superpowers:executing-plans')] },
  { slug: 'doc-tor',   name: 'Doc Tor',   scope: 'Documentation',                     color: '#0ea5e9', avatar_emoji: '📝', skills: [sp('superpowers:doc-coauthoring'), sp('superpowers:writing-skills')] },
  { slug: 'pip-lynn',  name: 'Pip Lynn',  scope: 'DevOps, CI/CD & infrastructure',    color: '#22c55e', avatar_emoji: '🛠️', skills: [sp('superpowers:devops')] },
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
  for (const a of AGENTS) {
    // INSERT OR IGNORE — only sets skills on first creation, never overwrites user-configured skills
    insertAgent.run(randomUUID(), a.slug, a.name, a.scope, a.color, a.avatar_emoji, JSON.stringify(a.skills))
  }

  // Migration 1: convert old string[] skills → {name, content}[]
  const allAgents = db.prepare('SELECT id, slug, skills FROM agents').all() as any[]
  const migrateSkills = db.prepare('UPDATE agents SET skills = ? WHERE id = ?')
  for (const agent of allAgents) {
    const parsed = JSON.parse(agent.skills ?? '[]')
    if (parsed.length > 0 && typeof parsed[0] === 'string') {
      const migrated = parsed.map((s: string) => ({ name: s, content: '' }))
      migrateSkills.run(JSON.stringify(migrated), agent.id)
    }
  }

  // Migration 2: fill in content for superpowers: skills that have empty content
  const allAgents2 = db.prepare('SELECT id, skills FROM agents').all() as any[]
  for (const agent of allAgents2) {
    const skills = JSON.parse(agent.skills ?? '[]') as { name: string; content: string }[]
    let changed = false
    const updated = skills.map(skill => {
      if (skill.content === '' && skill.name.startsWith('superpowers:')) {
        const skillName = skill.name.replace('superpowers:', '')
        const content = readSuperpowersSkill(skillName)
        if (content) { changed = true; return { ...skill, content } }
      }
      return skill
    })
    if (changed) migrateSkills.run(JSON.stringify(updated), agent.id)
  }
}
