---
name: devops
description: Use when making any change to CI/CD pipelines, Dockerfiles, infrastructure config, deployment settings, environment variables, build scripts, or cloud platform resources
---

# DevOps

## Overview

Infrastructure changes are not like code changes. A broken function fails fast and locally. A broken deployment fails in production, at scale, and is often hard to reverse.

**Core principle:** Understand before you change. Every infra change needs a blast radius assessment and a rollback plan before the first edit.

**Violating the letter of this process is violating the spirit of infrastructure work.**

## The Iron Law

```
NO INFRA CHANGE WITHOUT A ROLLBACK PLAN
```

If you have not identified how to revert this change, you cannot proceed.

## When to Use

Use for ANY change touching:
- CI/CD pipeline definitions (GitHub Actions, GitLab CI, Jenkins, etc.)
- Dockerfiles and container configuration
- Infrastructure-as-code (Terraform, Pulumi, CloudFormation, etc.)
- Deployment platform config (Railway, Vercel, Heroku, Fly.io, etc.)
- Environment variables and secrets
- Build scripts and toolchain configuration
- Cloud platform resources (databases, queues, storage, networking)
- SSL/TLS certificates and DNS

**Use this ESPECIALLY when:**
- The change affects production
- You are touching environment variables or secrets
- You are changing how the app starts or how dependencies are installed
- A previous deploy broke something
- You don't fully understand the current setup

**Don't skip when:**
- "It's just a one-line config change" (those are the ones that take down prod)
- You're in a hurry (systematic is faster than an incident at 2am)
- The change seems obvious (infra rarely behaves as expected)

## The Five Phases

You MUST complete each phase before moving to the next.

### Phase 1: Understand Current State

**Before touching anything:**

1. **Read the existing configuration**
   - Read the full pipeline/Dockerfile/config file — not just the section you plan to change
   - Understand what is currently deployed and how it got there
   - Identify all environments (dev, staging, prod) and their differences

2. **Understand the dependency chain**
   - What does this config depend on? (base images, env vars, external services)
   - What depends on this config? (other services, deployment steps, health checks)

3. **Know what "working" looks like**
   - What does a successful deploy produce? (health endpoint, log line, etc.)
   - How will you know if this change broke something?

**You cannot assess blast radius without completing Phase 1.**

### Phase 2: Assess Blast Radius

**For every planned change, answer:**

1. **Reversibility** — Can this be undone in under 5 minutes? If not, treat it as high-risk.
2. **Scope** — Does this affect one service or many? One environment or all?
3. **Rollback plan** — Write it out explicitly before proceeding:
   - What is the exact command or action to revert?
   - How long will revert take to propagate?
   - Is there data loss risk?

4. **Risk level:**
   - 🟢 Low: config change, reversible, single service, no data impact
   - 🟡 Medium: new dependency, env var change, affects multiple services
   - 🔴 High: database migration, secret rotation, network topology, production-only change

**If risk is 🔴, notify the team before proceeding.**

### Phase 3: Plan Incrementally

**Smallest possible change first:**

1. Break the change into the smallest independently deployable units
2. For each unit, write the explicit verification step before touching prod
3. Order changes so earlier ones can be reverted without affecting later ones
4. If the change requires multiple steps that must all succeed (e.g. schema migration + code deploy), treat them as a single atomic operation and plan the full rollback

**Never:**
- Bundle a risky change with unrelated changes in the same deploy
- Push to prod without having verified in a lower environment first (if one exists)

### Phase 4: Implement with Verification

**For each change:**

1. **Dry-run where possible** — `terraform plan`, `docker build` locally, CI lint checks
2. **Deploy to lower environment first** — verify there before touching prod
3. **Check immediately after deploy:**
   - Health endpoint responds
   - Expected log lines appear
   - The specific thing you changed behaves as expected
   - Downstream services still work
4. **Set a rollback threshold** — if X minutes pass without a clean health check, revert immediately. Don't wait and hope.

**Do not move to the next change until the current one is verified.**

### Phase 5: Document

After every successful infra change:

1. **Update environment variable docs** — if you added/changed/removed an env var, update the table in CLAUDE.md or README
2. **Update setup instructions** — if the local dev setup changed, update the quickstart
3. **Leave a breadcrumb** — add a comment to the config explaining *why* a non-obvious setting exists

**Undocumented infra is future incident bait.**

---

## Red Flags — Stop and Investigate

| Thought | Reality |
|---|---|
| "It works on my machine" | Infra is environment-specific. Verify in the target environment. |
| "I'll just push the env var and see if it works" | Test env var changes in dev first. Secrets are hard to rotate quickly. |
| "The deploy succeeded" | Check the health endpoint and logs. Deploy ≠ working. |
| "I'll document it later" | You won't. Do it now while you still know what you changed and why. |
| "It's just a comment/whitespace change" | CI pipelines have failed on exactly this. Verify. |
| "No need for a rollback plan on this one" | There is always a rollback plan. Write it before you start. |
| "I'll do a quick fix in prod first" | Never. Lower environment first, always. |

---

## Integration

**Works alongside:**
- **board-workflow** — call `start_story` before any infra work, `complete_story` after deploy is verified
- **systematic-debugging** — when the deploy breaks something, switch to debugging before reverting

**Handoff to:**
- **finishing-a-development-branch** — after infra work is verified and documented, use to close out the branch
- **requesting-code-review** — pipeline changes and Dockerfiles benefit from review before merge
