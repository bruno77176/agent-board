import postgres from 'postgres'
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import os from 'os'

/** Read a superpowers SKILL.md by name. Returns empty string if not found. */
function readSuperpowersSkill(skillName: string): string {
  // 1. Try local plugin cache (developer machine)
  const base = path.join(os.homedir(), '.claude', 'plugins', 'cache', 'claude-plugins-official', 'superpowers')
  if (fs.existsSync(base)) {
    const versions = fs.readdirSync(base).sort().reverse()
    for (const version of versions) {
      const skillPath = path.join(base, version, 'skills', skillName, 'SKILL.md')
      if (fs.existsSync(skillPath)) return fs.readFileSync(skillPath, 'utf-8')
    }
  }
  // 2. Fall back to bundled skills shipped with the server (production / Railway)
  // CWD is the server workspace directory when run via npm --workspace=server
  const bundled = path.join(process.cwd(), 'skills', skillName, 'SKILL.md')
  if (fs.existsSync(bundled)) return fs.readFileSync(bundled, 'utf-8')
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

export async function seed(sql: postgres.Sql): Promise<void> {
  for (const w of WORKFLOWS) {
    await sql`
      INSERT INTO workflows (id, name, states, transitions)
      VALUES (${w.id}, ${w.name}, ${sql.json(w.states)}, ${sql.json(w.transitions)})
      ON CONFLICT (id) DO NOTHING
    `
  }

  for (const a of AGENTS) {
    await sql`
      INSERT INTO agents (id, slug, name, scope, color, avatar_emoji, skills)
      VALUES (${randomUUID()}, ${a.slug}, ${a.name}, ${a.scope ?? null}, ${a.color}, ${a.avatar_emoji}, ${sql.json(a.skills)})
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        scope = EXCLUDED.scope,
        color = EXCLUDED.color,
        avatar_emoji = EXCLUDED.avatar_emoji
    `
  }

  // Migration 1: convert old string[] skills → {name, content}[]
  const allAgents = await sql`SELECT id, slug, skills FROM agents`
  for (const agent of allAgents) {
    const parsed = agent.skills ?? []
    if (parsed.length > 0 && typeof parsed[0] === 'string') {
      const migrated = parsed.map((s: string) => ({ name: s, content: '' }))
      await sql`UPDATE agents SET skills = ${sql.json(migrated)} WHERE id = ${agent.id}`
    }
  }

  // Migration 2: fill in content for superpowers: skills that have empty content
  const allAgents2 = await sql`SELECT id, skills FROM agents`
  for (const agent of allAgents2) {
    const skills = (agent.skills ?? []) as { name: string; content: string }[]
    let changed = false
    const updated = skills.map(skill => {
      if (skill.content === '' && skill.name.startsWith('superpowers:')) {
        const skillName = skill.name.replace('superpowers:', '')
        const content = readSuperpowersSkill(skillName)
        if (content) { changed = true; return { ...skill, content } }
      }
      return skill
    })
    if (changed) await sql`UPDATE agents SET skills = ${sql.json(updated)} WHERE id = ${agent.id}`
  }

  // Migration 3: add missing superpowers skills (additive — never removes manual skills)
  const allAgents3 = await sql`SELECT id, slug, skills FROM agents`
  for (const agent of allAgents3) {
    const agentDef = AGENTS.find(a => a.slug === agent.slug)
    if (!agentDef) continue
    const currentSkills = (agent.skills ?? []) as { name: string; content: string; source?: string }[]
    const currentNames = new Set(currentSkills.map(s => s.name))
    const missing = agentDef.skills.filter(s => !currentNames.has(s.name))
    if (missing.length === 0) continue
    const filledMissing = missing
      .map(s => {
        if (s.name.startsWith('superpowers:')) {
          const skillName = s.name.replace('superpowers:', '')
          const content = readSuperpowersSkill(skillName)
          if (!content) return null  // retry on next restart when plugin is present
          return { name: s.name, content, source: 'superpowers' as const }
        }
        return { name: s.name, content: s.content, source: 'manual' as const }
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
    if (filledMissing.length === 0) continue
    await sql`UPDATE agents SET skills = ${sql.json([...currentSkills, ...filledMissing])} WHERE id = ${agent.id}`
  }

  // Migration 4: add source field to skills that don't have it
  const allAgents4 = await sql`SELECT id, skills FROM agents`
  for (const agent of allAgents4) {
    const skills = (agent.skills ?? []) as { name: string; content: string; source?: string }[]
    const needsMigration = skills.some(s => s.source === undefined)
    if (!needsMigration) continue
    const updated = skills.map(s => ({
      ...s,
      source: s.source ?? (s.name.startsWith('superpowers:') ? 'superpowers' : 'manual'),
    }))
    await sql`UPDATE agents SET skills = ${sql.json(updated)} WHERE id = ${agent.id}`
  }
}
