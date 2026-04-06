---
project: BOARD
type: reference
---

# Agent Board Efficiency Overhead

Reference analysis of the token and latency cost of using agent-board alongside superpowers.

## Per-Story Overhead

| Step | MCP calls | ~Tokens | ~Latency |
|------|-----------|---------|---------|
| `start_story` | 1 | ~300 | 100–300ms |
| `complete_story` | 1 | ~300 | 100–300ms |
| `add_comment` (optional) | 1–2 | ~300 each | 100–300ms each |
| **Per story total** | **3–4** | **~900–1,200** | **~300–900ms** |

## Per-Feature (plan → epic creation via writing-plans patch)

| Step | MCP calls | ~Tokens |
|------|-----------|---------|
| `create_epic` | 1 | ~300 |
| `create_feature` | 1–2 | ~300 each |
| `create_story` × N tasks | N | ~300 each |
| **5-task plan** | **7–8** | **~2,100–2,400** |

## Full Feature Lifecycle (5 stories)

| | Without board | With board | Delta |
|--|---|---|---|
| MCP calls | 0 | ~27 | +27 |
| Tokens | ~150,000 | ~157,000 | **+5% tokens** |
| Wall-clock latency | — | ~3–7s | negligible |
| Context consumed | baseline | +~5k tokens | ~3% extra context |

## Where It Actually Hurts

1. **Context window erosion**: 27 tool calls × ~400 tokens each (input+output) = ~10k tokens consumed on board tracking alone. In long sessions this compounds significantly.

2. **Parallel dispatch overhead**: Each subagent prompt includes board-workflow instructions. Dispatching 4 agents = 4× the skill token overhead before they start work.

3. **Stale board on failures**: If a story fails mid-execution, the agent may not reach `complete_story`, leaving the board in a stale in-progress state requiring manual cleanup.

## Bottom Line

- **Token cost**: ~5–8% per feature — measurable but not crippling
- **Time cost**: <1% of total execution time (Railway MCP latency is fast)
- **Real cost**: Context window pressure in long sessions, and fragile handoffs when agents forget board calls

The overhead is acceptable for most features. It becomes noticeable on large parallel dispatches (5+ agents) or very long sessions where board tool outputs accumulate in context.

---
*Last updated: 2026-04-06*
