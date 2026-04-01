# MCP Developer Note

All relative imports in src/ MUST use `.js` extensions (e.g., `import { board } from './tools/board.js'`).
This is required because the package uses "type": "module" with module: node16 in tsconfig.
Without .js extensions, the compiled binary will fail at runtime.
