# Auth & Multi-User Design

**Date:** 2026-04-03  
**Status:** Approved  

## Context

The Agent Board is currently unauthenticated and single-tenant — all data is globally readable and writable by anyone with the URL. The goal is to add authentication and multi-user project access so clients can log in, see the projects they're involved in, and create feature requests that the developer picks up in Claude Code.

## Decisions

| Decision | Choice |
|----------|--------|
| Registration | Self-signup with admin approval |
| Roles | `admin` and `member` (system-wide) |
| Auth method | OAuth — Google and GitHub via Passport.js |
| Sessions | express-session with SQLite store (connect-better-sqlite3) |
| Pending user visibility | Public projects only |
| Admin notification | In-app badge (no email) |

## Data Model

### New: `users` table
```sql
CREATE TABLE users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  avatar_url   TEXT,
  provider     TEXT NOT NULL CHECK(provider IN ('google', 'github')),
  provider_id  TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'member')),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider, provider_id)
);
```

### New: `project_members` table
```sql
CREATE TABLE project_members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'member')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, user_id)
);
```

### Modified: `projects` table
Add one column:
```sql
ALTER TABLE projects ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
```

### Sessions
`connect-better-sqlite3` manages a `sessions` table automatically. Survives Railway restarts.

### First user rule
The first user to ever register is automatically set to `role = 'admin'` and `status = 'active'`. All subsequent users start as `status = 'pending'`.

## Auth Flow

1. User visits `/login` — two buttons: "Continue with Google", "Continue with GitHub"
2. OAuth redirect → provider authenticates → callback to `/api/auth/{provider}/callback`
3. Passport upserts the user record (find by `provider + provider_id`, create if missing)
4. Session cookie is set — user is logged in as pending or active
5. Pending users see public projects + a persistent banner
6. Admin approves via `/admin/users` → status becomes `active`
7. `POST /api/auth/logout` destroys session

## Route Protection

### Middleware
- `requireAuth` — applied globally to all `/api` routes. Returns `401` if no valid session.
- `requireAdmin` — applied to `/api/admin/*`. Returns `403` if `user.role !== 'admin'`.
- `requireProjectAccess` — resolves the project from the resource being accessed; returns `403` if project is private and user is not a member (admins bypass).

### Data filtering
- `GET /api/projects` — returns public projects + projects where user is a member. Admins get all.
- All nested resources (epics, features, stories) — project access checked via middleware.
- `POST /api/projects` — admin only.

### New endpoints
```
POST  /api/auth/google              OAuth redirect
GET   /api/auth/google/callback     OAuth callback
POST  /api/auth/github              OAuth redirect
GET   /api/auth/github/callback     OAuth callback
POST  /api/auth/logout              Destroy session
GET   /api/auth/me                  Return current user

GET   /api/admin/users              List all users (admin)
PATCH /api/admin/users/:id          Approve or change role (admin)

GET   /api/projects/:id/members     List project members
POST  /api/projects/:id/members     Add member by email
DELETE /api/projects/:id/members/:userId  Remove member
```
`PATCH /api/projects/:id` gets `is_public` added to its allowed fields.

## WebSocket Auth

WS upgrade carries the session cookie automatically (same domain). Server validates session on upgrade and rejects unauthenticated connections. Broadcast events for private projects are filtered to members of that project only.

## Client Changes

### New: `AuthProvider` + `useAuth()`
Wraps the app. Calls `GET /api/auth/me` on load. Exposes `user`, `isAdmin`, `isPending`, `isLoading`.

### Routing
```
/login            → LoginPage (public)
/                 → redirect to first available project
/:projectKey/*    → existing views, behind ProtectedRoute
/admin/users      → AdminUsersPage (admin only)
```

### New components
- **LoginPage** — centered card, two OAuth buttons, no forms
- **ProtectedRoute** — redirects to `/login` if not authenticated
- **PendingBanner** — top bar shown to pending users on private project routes
- **AdminUsersPage** — table of all users with Approve button
- **ProjectSettingsTab** — new tab in project nav: public/private toggle + member management

### Sidebar additions
- User avatar + name at bottom
- "Users" nav item (admin only) with pending count badge

## Dependencies to Add

### Server
```
passport
passport-google-oauth20
passport-github2
express-session
connect-better-sqlite3
@types/passport
@types/passport-google-oauth20
@types/passport-github2
@types/express-session
```

### Environment variables (Railway)
```
SESSION_SECRET         random 32+ char string
GOOGLE_CLIENT_ID       from Google Cloud Console
GOOGLE_CLIENT_SECRET   from Google Cloud Console
GITHUB_CLIENT_ID       from GitHub OAuth App
GITHUB_CLIENT_SECRET   from GitHub OAuth App
BASE_URL               https://your-app.railway.app
```
