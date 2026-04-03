# Jira vs Agent-Board — Gap Analysis

This document compares Jira's feature set with agent-board's current capabilities. It serves as a roadmap for future development.

---

## Work Item Types

| Feature | Jira | Agent-Board | Gap |
|---------|------|-------------|-----|
| Projects | Yes | Yes | — |
| Epics | Yes | Yes | — |
| Stories | Yes | Yes | — |
| Sub-tasks | Yes | Partial | `parent_story_id` exists but no UI for managing sub-tasks |
| Tasks (generic) | Yes | No | Stories serve as the only work unit |
| Bugs (typed) | Yes | No | No issue type field; bugs are just stories with tags |
| Sprints / Iterations | Yes | No | No sprint entity, no sprint planning or capacity |
| Components | Yes | No | Features serve a similar grouping role but are scoped under epics |
| Versions / Releases | Yes | Partial | Epics have a `version` field but it's cosmetic — no release management |

## Fields

| Feature | Jira | Agent-Board | Gap |
|---------|------|-------------|-----|
| Assignee | Yes | Yes (agent) | — |
| Reporter / Creator | Yes | No | No `created_by` field |
| Priority | Yes (5 levels) | Yes (3: high/medium/low) | Fewer levels |
| Labels / Tags | Yes | Yes | — |
| Story Points | Yes | No | Uses `estimated_minutes` instead |
| Time Tracking | Yes (original/remaining/logged) | No | Only `estimated_minutes`, no actual time |
| Due Date | Yes | No | No date fields beyond `created_at` |
| Description | Yes (rich text) | Yes (plain text) | No rich text / markdown rendering |
| Acceptance Criteria | Via description/checklist | Yes (dedicated JSON field) | Agent-board is ahead here |
| Custom Fields | Yes (unlimited) | No | Fixed schema only |
| Attachments | Yes | No | No file storage |
| Story Links (blocks, relates to, duplicates) | Yes | No | No inter-story relationships |
| Git Branch | Via integrations | Yes (native `git_branch` field) | Agent-board is ahead here |

## Board & Views

| Feature | Jira | Agent-Board | Gap |
|---------|------|-------------|-----|
| Kanban Board | Yes | Yes | — |
| Scrum Board | Yes | No | No sprint-based board |
| Drag-and-drop | Yes | No | Cards display but are not draggable |
| Swimlanes (by assignee, epic, priority) | Yes | No | Single flat column layout |
| WIP Limits | Yes | No | No column constraints |
| Board Configuration (columns, order) | Yes | No | Columns derived from workflow states |
| Backlog View | Yes | Yes | — |
| List View | Yes | Yes | — |
| Roadmap / Timeline | Yes | No | No Gantt or timeline visualization |
| Calendar View | Yes | No | No date-based views |
| Dashboard | Yes | No | No configurable dashboards |
| Quick Filters (saved) | Yes | No | Filters exist but cannot be saved |
| Bulk Operations | Yes | No | No multi-select or batch actions |
| Inline Editing | Yes | Partial | Title/description/priority editable; status/assignee/tags not |

## Search & Filtering

| Feature | Jira | Agent-Board | Gap |
|---------|------|-------------|-----|
| JQL (query language) | Yes | No | Basic UI filters only |
| Text Search | Yes | Yes | Searches title, description, short_id |
| Filter by Assignee | Yes | Yes | — |
| Filter by Priority | Yes | Yes | — |
| Filter by Epic | Yes | Yes | — |
| Filter by Tags | Yes | Yes | — |
| Filter by Status | Yes | No | Board groups by status but no explicit filter |
| Filter by Date Range | Yes | No | No date-based filtering |
| Cross-project Search | Yes | No | Filters scoped to single project |
| Saved Filters | Yes | No | Filters are ephemeral |

## Workflows

| Feature | Jira | Agent-Board | Gap |
|---------|------|-------------|-----|
| Custom Workflows | Yes | Yes (3 presets: light/standard/full) | Presets only, no custom creation |
| Workflow States | Yes | Yes | — |
| Transitions | Yes | Yes | — |
| Conditions (who can transition) | Yes | No | Any agent can make any transition |
| Validators (field requirements) | Yes | No | No pre-transition validation |
| Post-functions (auto-actions) | Yes | No | No triggered side-effects |
| Workflow Schemes (per issue type) | Yes | No | One workflow per project |

## Reporting & Analytics

| Feature | Jira | Agent-Board | Gap |
|---------|------|-------------|-----|
| Burndown Chart | Yes | No | — |
| Velocity Chart | Yes | No | — |
| Cumulative Flow Diagram | Yes | No | — |
| Sprint Report | Yes | No | No sprints |
| Created vs Resolved | Yes | No | — |
| Agent Workload | Yes | No | Agent profile shows stories but no capacity metrics |
| Status Rollups (epic/feature progress) | Yes | No | No aggregated completion tracking |

## Collaboration

| Feature | Jira | Agent-Board | Gap |
|---------|------|-------------|-----|
| Comments / Discussion | Yes (threaded) | Partial | Events table logs comments but no threading |
| @Mentions | Yes | No | — |
| Watchers / Followers | Yes | No | — |
| Activity Feed | Yes | Yes (event log per story) | — |
| Email Notifications | Yes | No | — |
| Webhook Notifications | Yes | No | WebSocket broadcast only (browser) |

## Permissions & Security

| Feature | Jira | Agent-Board | Gap |
|---------|------|-------------|-----|
| User Authentication | Yes | No | Open access |
| Project Roles | Yes | No | All agents are equal |
| Permission Schemes | Yes | No | — |
| Field-level Permissions | Yes | No | — |
| Audit Log | Yes | Yes (events table) | — |

## Integrations

| Feature | Jira | Agent-Board | Gap |
|---------|------|-------------|-----|
| GitHub / Git | Yes (via apps) | Yes (native git_branch + MCP) | Agent-board has tighter Claude Code integration |
| Slack | Yes | No | — |
| Confluence / Docs | Yes | No | Plans are markdown files, not linked |
| REST API | Yes | Yes | — |
| Webhooks (outbound) | Yes | No | — |
| MCP / Claude Code | No | Yes | Agent-board's unique advantage |
| Automation Rules | Yes | No | No if-this-then-that automation |

## UI Polish

| Feature | Jira | Agent-Board | Gap |
|---------|------|-------------|-----|
| Keyboard Shortcuts | Yes (extensive) | No | Only Enter in acceptance criteria input |
| Clone / Duplicate | Yes | No | — |
| Story Templates | Yes | No | — |
| Breadcrumb Navigation | Yes | Yes | — |
| Real-time Updates | Yes | Yes (WebSocket) | — |
| Mobile Responsive | Yes | No | Desktop-only layout |
| Dark Mode | Yes | No | Light theme only |

---

## Priority Recommendations

### High Priority (core agent workflow)
1. **Drag-and-drop** on Kanban board — basic board interaction
2. **Story linking** (blocks/blocked-by) — needed for dependency tracking
3. **Status rollups** on epics/features — progress visibility
4. **Richer MCP read tools** — get_epic, get_feature, project overview (in progress)

### Medium Priority (productivity)
5. **Inline status change** from board/list views
6. **Inline assignee change** from board/list views
7. **Comments with threading** — better traceability
8. **Reporter/creator tracking** — who created the story
9. **Due dates** — time-boxed work
10. **Saved filters** — repeatable queries

### Lower Priority (nice to have)
11. Sprint management
12. Reporting dashboards
13. Keyboard shortcuts
14. Story templates / cloning
15. Bulk operations
16. Automation rules
