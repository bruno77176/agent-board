import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { board } from './tools/board.js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const server = new McpServer({ name: 'agent-board', version: '1.0.0' })

// ── Board reading ─────────────────────────────────────────────────

server.tool(
  'get_board',
  'Get all stories for a project, grouped by status',
  { project_id: z.string().describe('Project ID') },
  async ({ project_id }) => {
    const stories = await board.getStories(project_id)
    return { content: [{ type: 'text' as const, text: JSON.stringify(stories, null, 2) }] }
  }
)

server.tool(
  'get_story',
  'Get a single story with full event history',
  { story_id: z.string() },
  async ({ story_id }) => {
    const story = await board.getStory(story_id)
    return { content: [{ type: 'text' as const, text: JSON.stringify(story, null, 2) }] }
  }
)

server.tool(
  'list_agents',
  'List all typed agents on the roster',
  {},
  async () => {
    const agents = await board.listAgents()
    return { content: [{ type: 'text' as const, text: JSON.stringify(agents, null, 2) }] }
  }
)

server.tool(
  'list_projects',
  'List all projects on the board',
  {},
  async () => {
    const projects = await board.listProjects()
    return { content: [{ type: 'text' as const, text: JSON.stringify(projects, null, 2) }] }
  }
)

server.tool(
  'create_project',
  'Create a new project on the board. Use workflow_id: "standard" unless the user specifies otherwise.',
  {
    key: z.string().describe('Short uppercase identifier, e.g. PROJ or MYAPP'),
    name: z.string().describe('Full project name'),
    description: z.string().optional(),
    workflow_id: z.enum(['light', 'standard', 'full']).default('standard'),
    is_public: z.coerce.number().int().min(0).max(1).optional().default(0).describe('1 = public, 0 = private (default)'),
  },
  async (args) => {
    const project = await board.createProject(args)
    return { content: [{ type: 'text' as const, text: JSON.stringify(project, null, 2) }] }
  }
)

server.tool(
  'list_epics',
  'List all epics for a project',
  { project_id: z.string() },
  async ({ project_id }) => {
    const epics = await board.listEpics(project_id)
    return { content: [{ type: 'text' as const, text: JSON.stringify(epics, null, 2) }] }
  }
)

server.tool(
  'get_epic',
  'Get a single epic with its features and story count/status rollups per feature',
  { epic_id: z.string().describe('Epic ID or short_id (e.g. PROJ-E1)') },
  async ({ epic_id }) => {
    const epic = await board.getEpic(epic_id)
    return { content: [{ type: 'text' as const, text: JSON.stringify(epic, null, 2) }] }
  }
)

server.tool(
  'get_feature',
  'Get a single feature with its child stories, story count rollups, and parent epic info',
  { feature_id: z.string().describe('Feature ID or short_id (e.g. PROJ-F1)') },
  async ({ feature_id }) => {
    const feature = await board.getFeature(feature_id)
    return { content: [{ type: 'text' as const, text: JSON.stringify(feature, null, 2) }] }
  }
)

server.tool(
  'list_features',
  'List features for an epic or all features for a project',
  {
    epic_id: z.string().optional().describe('Filter by epic ID or short_id'),
    project_id: z.string().optional().describe('Filter by project ID — returns all features across all epics'),
  },
  async ({ epic_id, project_id }) => {
    if (!epic_id && !project_id) {
      throw new Error('list_features requires either epic_id or project_id')
    }
    const features = await board.listFeatures({ epic_id, project_id })
    return { content: [{ type: 'text' as const, text: JSON.stringify(features, null, 2) }] }
  }
)

server.tool(
  'get_project_overview',
  'Get full project hierarchy: epics → features → story counts/status summaries, plus recent activity. Use this for "what\'s new on the board".',
  { project_id: z.string().describe('Project ID or project key (e.g. PROJ)') },
  async ({ project_id }) => {
    const overview = await board.getProjectOverview(project_id)
    return { content: [{ type: 'text' as const, text: JSON.stringify(overview, null, 2) }] }
  }
)

// ── Creating work ─────────────────────────────────────────────────

server.tool(
  'create_epic',
  'Create a new epic under a project',
  {
    project_id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    version: z.string().optional().describe('e.g. v0.0.1'),
    source_doc: z.string().optional().describe('Relative path to the plan file, e.g. "plans/2026-04-05-my-plan.md". Set this when creating an epic from a plan.'),
  },
  async (args) => {
    const epic = await board.createEpic(args)
    return { content: [{ type: 'text' as const, text: `Epic created: ${epic.short_id ?? epic.id} — ${epic.title}` }] }
  }
)

server.tool(
  'update_epic',
  'Update an epic\'s title, description, version, status, or date range (start_date/end_date as ISO strings e.g. "2026-04-01").',
  {
    epic_id: z.string().describe('Epic ID or short_id'),
    title: z.string().optional(),
    description: z.string().optional(),
    version: z.string().optional(),
    status: z.enum(['active', 'completed', 'cancelled']).optional(),
    start_date: z.string().optional().describe('ISO date string e.g. 2026-04-01'),
    end_date: z.string().optional().describe('ISO date string e.g. 2026-04-30'),
  },
  async ({ epic_id, ...data }) => {
    const epic = await board.updateEpic(epic_id, data)
    return { content: [{ type: 'text' as const, text: JSON.stringify(epic, null, 2) }] }
  }
)

server.tool(
  'create_feature',
  'Create a new feature under an epic',
  {
    epic_id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    tags: z.preprocess(v => {
      if (typeof v === 'string') { try { return JSON.parse(v) } catch { return [] } }
      return v
    }, z.array(z.string()).optional()),
  },
  async (args) => {
    const feature = await board.createFeature(args)
    return { content: [{ type: 'text' as const, text: `Feature created: ${feature.short_id ?? feature.id} — ${feature.title}` }] }
  }
)

server.tool(
  'create_story',
  'Create a new story under a feature. Stories must be ≤10 min estimated work.',
  {
    feature_id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    priority: z.enum(['high', 'medium', 'low']).optional().default('medium'),
    tags: z.preprocess(v => {
      if (typeof v === 'string') { try { return JSON.parse(v) } catch { return [] } }
      return v
    }, z.array(z.string()).optional()),
    estimated_minutes: z.coerce.number().optional().describe('Estimated minutes. Warn if >10.'),
    parent_story_id: z.string().optional().describe('For TDD sub-stories'),
  },
  async (args) => {
    if (args.estimated_minutes && args.estimated_minutes > 10) {
      return {
        content: [{
          type: 'text' as const,
          text: `⚠️ Story "${args.title}" estimated at ${args.estimated_minutes} min exceeds the 10-min granularity guideline. Break it down further before creating.`
        }]
      }
    }
    const story = await board.createStory(args)
    return { content: [{ type: 'text' as const, text: `Story created: ${story.short_id ?? story.id} — ${story.title} [${story.status}]` }] }
  }
)

// ── Agent workflow ────────────────────────────────────────────────

server.tool(
  'start_story',
  'Assign a story to an agent and move it to In Progress',
  { story_id: z.string(), agent_id: z.string().describe('Agent slug, e.g. tess-ter') },
  async ({ story_id, agent_id }) => {
    const story = await board.moveStatus(story_id, 'in_progress', agent_id, 'Started work')
    return { content: [{ type: 'text' as const, text: `${story.short_id ?? story.id} "${story.title}" → In Progress (${agent_id})` }] }
  }
)

server.tool(
  'move_story',
  'Move a story to any valid status',
  {
    story_id: z.string(),
    status: z.string().describe('Target status, e.g. todo, in_progress, review, qa, done'),
    agent_id: z.string().optional(),
    comment: z.string().optional(),
  },
  async ({ story_id, status, agent_id, comment }) => {
    const story = await board.moveStatus(story_id, status, agent_id, comment)
    return { content: [{ type: 'text' as const, text: `${story.short_id ?? story.id} "${story.title}" → ${status}` }] }
  }
)

server.tool(
  'request_review',
  'Move a story to the Review column and log the requesting agent',
  { story_id: z.string(), agent_id: z.string().optional() },
  async ({ story_id, agent_id }) => {
    const story = await board.moveStatus(story_id, 'review', agent_id, 'Requested code review')
    return { content: [{ type: 'text' as const, text: `${story.short_id ?? story.id} "${story.title}" → Review` }] }
  }
)

server.tool(
  'complete_story',
  'Mark a story as Done. Requires checklist confirmation.',
  {
    story_id: z.string(),
    agent_id: z.string().optional(),
    checklist_confirmed: z.preprocess(v => v === 'true' || v === true, z.boolean()).describe('Set true only if: tests pass, code reviewed, no regressions'),
  },
  async ({ story_id, agent_id, checklist_confirmed }) => {
    if (!checklist_confirmed) {
      return {
        content: [{
          type: 'text' as const,
          text: '❌ Cannot complete: checklist_confirmed must be true. Verify all tests pass, code is reviewed, and no regressions introduced.'
        }]
      }
    }
    const story = await board.moveStatus(story_id, 'done', agent_id, '✅ Completed — checklist confirmed')
    return { content: [{ type: 'text' as const, text: `${story.short_id ?? story.id} "${story.title}" → Done ✅` }] }
  }
)

server.tool(
  'escalate_story',
  'Escalate after 3 failures: returns story to backlog and creates a blocking arch-review story',
  {
    story_id: z.string(),
    agent_id: z.string().optional(),
    reason: z.string().describe('Why escalating — what failed 3 times'),
  },
  async ({ story_id, agent_id, reason }) => {
    const story = await board.getStory(story_id)
    await board.moveStatus(story_id, 'backlog', agent_id, `🚨 Escalated after 3 failures: ${reason}`)
    const archStory = await board.createStory({
      feature_id: story.feature_id,
      title: `[ARCH REVIEW] ${story.title}`,
      description: `Escalated from story ${story_id}.\n\nReason: ${reason}`,
      priority: 'high',
      tags: ['arch-review', 'blocked'],
    })
    return {
      content: [{
        type: 'text' as const,
        text: `🚨 Escalated. Story "${story.title}" returned to backlog. Arch review story created: ${archStory.short_id ?? archStory.id}`
      }]
    }
  }
)

server.tool(
  'add_comment',
  'Add a comment to any entity (story, feature, or epic) for traceability',
  {
    target_type: z.enum(['story', 'feature', 'epic']).describe('What you are commenting on'),
    target_id: z.string().describe('ID of the story, feature, or epic'),
    agent_id: z.string().optional().describe('Agent slug making the comment'),
    comment: z.string().describe('The comment — be descriptive for traceability'),
  },
  async ({ target_type, target_id, agent_id, comment }) => {
    await board.createEvent({ target_type, target_id, agent_id, comment })
    return { content: [{ type: 'text' as const, text: `Comment added to ${target_type} ${target_id}` }] }
  }
)

// ── Superpowers-specific ──────────────────────────────────────────

server.tool(
  'create_tdd_cycle',
  'Create 3 TDD sub-stories (RED/GREEN/REFACTOR) under a parent story',
  {
    parent_story_id: z.string().describe('The story this TDD cycle belongs to'),
    feature_id: z.string().describe('Feature ID (same as parent story)'),
  },
  async ({ parent_story_id, feature_id }) => {
    const red = await board.createStory({ feature_id, parent_story_id, title: '🔴 RED — Write failing test', priority: 'high', estimated_minutes: 5 })
    const green = await board.createStory({ feature_id, parent_story_id, title: '🟢 GREEN — Make test pass (minimal code)', priority: 'high', estimated_minutes: 5 })
    const refactor = await board.createStory({ feature_id, parent_story_id, title: '🔵 REFACTOR — Clean up', priority: 'medium', estimated_minutes: 5 })
    return {
      content: [{
        type: 'text' as const,
        text: `TDD cycle created:\n  🔴 ${red.short_id ?? red.id} — ${red.title}\n  🟢 ${green.short_id ?? green.id} — ${green.title}\n  🔵 ${refactor.short_id ?? refactor.id} — ${refactor.title}`
      }]
    }
  }
)

server.tool(
  'link_worktree',
  'Link a git branch/worktree to a story for traceability',
  {
    story_id: z.string(),
    git_branch: z.string().describe('Branch name, e.g. feat/login-form'),
  },
  async ({ story_id, git_branch }) => {
    const updated = await board.updateStory(story_id, { git_branch })
    return { content: [{ type: 'text' as const, text: `${updated.short_id ?? updated.id} linked to branch: ${git_branch}` }] }
  }
)

server.tool(
  'update_story',
  'Update story fields: title, description, priority, estimated_minutes, tags, acceptance_criteria',
  {
    story_id: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    priority: z.enum(['high', 'medium', 'low']).optional(),
    estimated_minutes: z.coerce.number().optional(),
    tags: z.preprocess(v => {
      if (typeof v === 'string') { try { return JSON.parse(v) } catch { return [] } }
      return v
    }, z.array(z.string()).optional()),
    acceptance_criteria: z.array(z.object({
      id: z.string(),
      text: z.string(),
      checked: z.boolean(),
    })).optional().describe('Full acceptance criteria list with checked state'),
  },
  async ({ story_id, ...updates }) => {
    const story = await board.updateStory(story_id, updates)
    return { content: [{ type: 'text' as const, text: JSON.stringify(story, null, 2) }] }
  }
)

server.tool(
  'link_stories',
  'Create a directional link between two stories. Use link_type "blocks" when one story must be completed before another can start — agents should call this to declare blockers before starting work.',
  {
    from_story_id: z.string().describe('Story ID or short_id of the blocking/source story'),
    to_story_id: z.string().describe('Story ID or short_id of the blocked/target story'),
    link_type: z.enum(['blocks', 'duplicates', 'relates_to']),
  },
  async ({ from_story_id, to_story_id, link_type }) => {
    const link = await board.linkStories(from_story_id, { to_story_id, link_type })
    return { content: [{ type: 'text' as const, text: JSON.stringify(link, null, 2) }] }
  }
)

server.tool(
  'get_story_links',
  'Get all links for a story — shows what it blocks, what blocks it, and duplicates. Check this before starting work on a story to identify blockers.',
  {
    story_id: z.string().describe('Story ID or short_id'),
  },
  async ({ story_id }) => {
    const links = await board.getStoryLinks(story_id)
    return { content: [{ type: 'text' as const, text: JSON.stringify(links, null, 2) }] }
  }
)

server.tool(
  'delete_story_link',
  'Remove a link between two stories. Use the link id from get_story_links output.',
  {
    story_id: z.string().describe('Story ID or short_id'),
    link_id: z.string().describe('Link ID from get_story_links'),
  },
  async ({ story_id, link_id }) => {
    await board.deleteStoryLink(story_id, link_id)
    return { content: [{ type: 'text' as const, text: 'Link deleted.' }] }
  }
)

server.tool(
  'update_feature',
  'Update a feature title or description',
  {
    feature_id: z.string().describe('Feature ID or short_id'),
    title: z.string().optional(),
    description: z.string().optional(),
  },
  async ({ feature_id, ...updates }) => {
    const feature = await board.updateFeature(feature_id, updates)
    return { content: [{ type: 'text' as const, text: JSON.stringify(feature, null, 2) }] }
  }
)

server.tool(
  'delete_story',
  'Permanently delete a story and all its events and links',
  { story_id: z.string().describe('Story ID or short_id') },
  async ({ story_id }) => {
    await board.deleteStory(story_id)
    return { content: [{ type: 'text' as const, text: `Story ${story_id} deleted.` }] }
  }
)

server.tool(
  'delete_feature',
  'Permanently delete a feature and all its stories',
  { feature_id: z.string().describe('Feature ID or short_id') },
  async ({ feature_id }) => {
    await board.deleteFeature(feature_id)
    return { content: [{ type: 'text' as const, text: `Feature ${feature_id} deleted.` }] }
  }
)

server.tool(
  'delete_epic',
  'Permanently delete an epic and all its features and stories',
  { epic_id: z.string().describe('Epic ID or short_id') },
  async ({ epic_id }) => {
    await board.deleteEpic(epic_id)
    return { content: [{ type: 'text' as const, text: `Epic ${epic_id} deleted.` }] }
  }
)

server.tool(
  'list_stories',
  'List stories with optional filters. At least one filter required.',
  {
    project_id: z.string().optional().describe('Filter by project ID'),
    feature_id: z.string().optional().describe('Filter by feature ID or short_id'),
    status: z.string().optional().describe('Filter by status: backlog, todo, in_progress, review, qa, done'),
    agent_id: z.string().optional().describe('Filter by agent slug or ID'),
  },
  async (params) => {
    if (!params.project_id && !params.feature_id) {
      throw new Error('list_stories requires at least project_id or feature_id')
    }
    const stories = await board.listStories(params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(stories, null, 2) }] }
  }
)

server.tool(
  'sync_doc',
  'Sync a markdown document to the board. The doc must have frontmatter "project: KEY" and use H1=epic, H2=feature, H3=story structure.',
  { content: z.string().describe('Full markdown content including frontmatter') },
  async ({ content }) => {
    const result = await board.syncDoc(content)
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'upload_doc',
  'Upload a local plan/doc file to the server so it appears in the board UI. Call this after writing a plan file, then use the returned relative_path as source_doc when creating the epic.',
  {
    file_path: z.string().describe('Absolute local path to the .md file to upload'),
    relative_path: z.string().describe('Relative path within docs root, e.g. "plans/2026-04-05-my-plan.md"'),
  },
  async ({ file_path, relative_path }) => {
    const content = readFileSync(resolve(file_path), 'utf-8')
    await board.uploadDoc(relative_path, content)
    return { content: [{ type: 'text' as const, text: `Uploaded: ${relative_path}` }] }
  }
)

// ── Start ─────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
