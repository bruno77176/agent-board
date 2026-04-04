---
project: BOARD
type: implementation-plan
---

# MCP Audit Fixes & Improvements

> Fixes and enhancements identified during the 2026-04-04 MCP tool audit. All items tracked under Epic BOARD-E5.

## Bug Fixes

### Fix complete_story boolean coercion
MCP SDK passes all params as strings. `checklist_confirmed: true` arrives as `"true"`, breaking z.boolean(). Use z.preprocess to coerce string to boolean.
- [ ] Add z.preprocess coercion to checklist_confirmed in complete_story tool
- [ ] Verify complete_story works end-to-end via MCP

### Fix tags array and estimated_minutes number coercion
create_feature and create_story reject tags (Expected array, received string) and estimated_minutes (Expected number, received string). Root cause: MCP SDK serializes all params as strings.
- [ ] Add z.preprocess JSON.parse coercion for tags in create_feature
- [ ] Add z.preprocess JSON.parse coercion for tags in create_story
- [ ] Add z.coerce.number() for estimated_minutes in create_story
- [ ] Verify tags and estimated_minutes work end-to-end

### Fix delete_story_link empty body crash
DELETE /stories/:id/links/:linkId returns 204 No Content. board.ts calls res.json() unconditionally, crashing on empty response body.
- [ ] Guard JSON parsing in call() with status 204 check
- [ ] Verify delete_story_link works without crashing

### Fix write operations rejecting short_ids
start_story, move_story, update_story etc. return 404 when passed short_ids like BOARD-1. Server write routes used WHERE id = ? instead of WHERE id = ? OR short_id = ?.
- [ ] Fix PATCH /stories/:id/status to resolve short_id
- [ ] Fix PATCH /stories/:id to resolve short_id
- [ ] Verify start_story and move_story work with short_ids

## New Features

### Add update_feature MCP tool
No way to edit a feature title or description after creation. Server already has PATCH /features/:id.
- [ ] Add update_feature tool to MCP server
- [ ] Verify update_feature works via MCP

### Add delete tools for story, feature, epic
No cleanup path for erroneous entities. Add DELETE endpoints with cascade.
- [ ] Add DELETE /stories/:id with cascade to links and events
- [ ] Add DELETE /features/:id with cascade to stories
- [ ] Add DELETE /epics/:id with full cascade
- [ ] Add delete_story, delete_feature, delete_epic MCP tools
- [ ] Verify all three delete operations work

### Add list_stories with filters
Stories only accessible via get_board (all) or get_feature. Add filtering by status, agent, project.
- [ ] Add status and agent_id query filters to GET /stories
- [ ] Add list_stories MCP tool with project_id, feature_id, status, agent_id params
- [ ] Verify list_stories returns filtered results

### Add sync_doc HTTP endpoint and MCP tool
Doc watcher requires server filesystem access. Add HTTP endpoint so agents can sync markdown remotely.
- [ ] Add POST /api/docs/sync endpoint accepting markdown content
- [ ] Add sync_doc MCP tool
- [ ] Verify doc sync works from MCP client against deployed server

### Expose is_public flag in create_project
Projects always created private. Add is_public parameter to create_project MCP tool.
- [ ] Add is_public coercion to create_project tool
- [ ] Verify public project creation works
