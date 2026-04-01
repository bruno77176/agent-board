# Agent Board

A Jira-like ticketing system for Claude Code agents. Agents have named identities on the board and their work is reflected in real time via MCP.

## Architecture

- **Web app** (Express + React + SQLite) — deployed to Railway/Render
- **MCP server** (Node.js stdio) — runs locally in Claude Code
- **board-workflow skill** — maps superpowers skills to agent identities

## Quick Start

### 1. Deploy the web app

```bash
# Push to GitHub, then connect to Railway
git push origin main
# Railway auto-deploys on push
# Add a volume mounted at /app/data for SQLite persistence
```

### 2. Configure the MCP server

Build the MCP server:
```bash
npm run build --workspace=mcp
```

Add to Claude Code settings (`~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "agent-board": {
      "command": "node",
      "args": ["/absolute/path/to/agent-board/mcp/dist/index.js"],
      "env": { "BOARD_URL": "https://your-app.railway.app" }
    }
  }
}
```

### 3. Use the board-workflow skill

Copy `skills/board-workflow.md` to your project's skills directory and load it alongside any superpowers skill.

## Development

```bash
# Start server (with hot reload)
npm run dev:server

# Start client (in another terminal)
npm run dev:client
```

Open http://localhost:5173 for the board UI.

## Default Agents

| Agent | Slug | Scope |
|---|---|---|
| 🏛️ Arch Lee | arch-lee | Architecture & planning |
| 🧪 Tess Ter | tess-ter | Testing & QA |
| 🐛 Deb Ugg | deb-ugg | Debugging |
| 🔍 Rev Yu | rev-yu | Code review |
| 🚀 Dee Ploy | dee-ploy | Deployment & merge |
| ⚙️ Dev In | dev-in | Backend implementation |
| 🎨 Fron Tina | fron-tina | Frontend implementation |
| 📝 Doc Tor | doc-tor | Documentation |
