---
type: design
---

# Pip Lynn DevOps Skill Design

## Problem

Pip Lynn (slug: `pip-lynn`) is the DevOps/CI/CD/infrastructure agent in the agent-board roster but has no assigned superpowers skill. Every other agent has structured behavioral guidance; Pip Lynn operates with none.

## Decision

Create a general-purpose `devops` skill comparable in quality and structure to `systematic-debugging`. It lives in `agent-board/skills/` and is installed as a user skill alongside `board-workflow`. Any project can use it — no agent-board dependency.

## Skill structure

- **Trigger:** CI/CD pipelines, Dockerfiles, infra-as-code, deployment config, env vars, build scripts, cloud platform settings, secrets management
- **Iron Law:** Understand before you change. Infra changes are hard to reverse.
- **5-phase process:**
  1. Understand current state — read existing config, know what's deployed, what environments exist
  2. Assess blast radius — what breaks? is it reversible? what is the rollback?
  3. Plan incrementally — smallest possible change, explicit verification steps before touching prod
  4. Implement with verification — dry-run where possible, check health/logs after every deploy
  5. Document — update CLAUDE.md, README, env var docs
- **Red flags:** "works locally", pushing env changes untested, no rollback plan, assuming deploy succeeded without checking

## File location

- `agent-board/skills/devops/SKILL.md` — source of truth in repo
- `~/.claude/skills/devops/SKILL.md` — installed user skill

## What does NOT change

- No server changes
- No MCP changes
- No superpowers patches
