---
name: board-workflow
description: Maps superpowers skills to typed agent identities and board MCP tool calls. Load alongside any superpowers skill when working on a project that uses Agent Board. Ensures every agent action is traced on the board.
type: workflow
---

# Board Workflow Skill

This skill tells you which agent identity to assume and which MCP tools to call at each moment in the development lifecycle. It bridges the superpowers skill system with the Agent Board ticketing system.

## Agent Identity Map

When you invoke a superpowers skill, assume the corresponding agent identity for all MCP `agent_id` parameters:

| Active skill | Agent identity | agent_id |
|---|---|---|
| brainstorming, writing-plans | Arch Lee 🏛️ | `arch-lee` |
| test-driven-development | Tess Ter 🧪 | `tess-ter` |
| systematic-debugging | Deb Ugg 🐛 | `deb-ugg` |
| requesting-code-review, receiving-code-review | Rev Yu 🔍 | `rev-yu` |
| finishing-a-development-branch | Dee Ploy 🚀 | `dee-ploy` |
| executing-plans (backend) | Dev In ⚙️ | `dev-in` |
| frontend-design, executing-plans (frontend) | Fron Tina 🎨 | `fron-tina` |
| doc-coauthoring | Doc Tor 📝 | `doc-tor` |

## MCP Tools — When to Call Them

### After brainstorming design is approved (Arch Lee)
```
create_epic(project_id, title, version)
create_feature(epic_id, title)          — one per major component
create_story(feature_id, title, estimated_minutes)  — one per plan step, max 10 min
```

### After writing-plans creates the implementation plan (Arch Lee)
```
create_story(feature_id, title, estimated_minutes)  — one story per plan task
```

### When starting a story (any agent)
```
start_story(story_id, agent_id)
```

### When test-driven-development begins a new cycle (Tess Ter)
```
create_tdd_cycle(parent_story_id, feature_id)
start_story(red_story_id, "tess-ter")
```
Move each sub-story as you complete it: 🔴 → done, then 🟢 → done, then 🔵 → done.

### When using-git-worktrees creates a branch (any agent)
```
link_worktree(story_id, git_branch)
```

### After 3 failed attempts — systematic-debugging rule (Deb Ugg)
```
escalate_story(story_id, "deb-ugg", reason)
```

### When requesting code review (Rev Yu)
```
request_review(story_id, "rev-yu")
```

### Before marking any story done (any agent)
```
complete_story(story_id, agent_id, checklist_confirmed: true)
```
Only pass `checklist_confirmed: true` if ALL of the following:
- All tests pass
- Code has been reviewed (or self-reviewed for non-critical changes)
- No regressions introduced

### For traceability — leaving notes (any agent)
```
add_comment(target_type, target_id, agent_id, comment)
```
Use this liberally. Leave comments on epics and features when starting/finishing major phases, and on stories when making significant decisions.

## Granularity Rule

Stories must represent ≤ 10 minutes of estimated work. The MCP server enforces this and will refuse to create stories exceeding this limit.

If a task feels larger than 10 minutes, break it into multiple stories before calling `create_story`.

## Setup (one time)

1. The MCP server must be registered in Claude Code settings:
```json
{
  "mcpServers": {
    "agent-board": {
      "command": "node",
      "args": ["/absolute/path/to/agent-board/mcp/dist/index.js"],
      "env": { "BOARD_URL": "https://your-deployed-app.railway.app" }
    }
  }
}
```

2. Verify with `list_agents` — should return 8 agents (Arch Lee, Tess Ter, etc.).

3. Create your project: ask Arch Lee to run `create_epic` after the first brainstorming session.
