export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    states JSONB NOT NULL DEFAULT '[]',
    transitions JSONB NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    workflow_id TEXT NOT NULL REFERENCES workflows(id),
    is_public INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    scope TEXT,
    color TEXT NOT NULL,
    avatar_emoji TEXT NOT NULL,
    skills JSONB NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS epics (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    description TEXT,
    version TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    short_id TEXT,
    start_date TEXT,
    end_date TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_doc TEXT
  );

  CREATE TABLE IF NOT EXISTS features (
    id TEXT PRIMARY KEY,
    epic_id TEXT NOT NULL REFERENCES epics(id),
    title TEXT NOT NULL,
    description TEXT,
    tags JSONB NOT NULL DEFAULT '[]',
    short_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,
    feature_id TEXT NOT NULL REFERENCES features(id),
    parent_story_id TEXT REFERENCES stories(id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog',
    priority TEXT NOT NULL DEFAULT 'medium',
    assigned_agent_id TEXT REFERENCES agents(id),
    tags JSONB NOT NULL DEFAULT '[]',
    acceptance_criteria JSONB NOT NULL DEFAULT '[]',
    estimated_minutes INTEGER,
    git_branch TEXT,
    short_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL DEFAULT 'story',
    target_id TEXT NOT NULL,
    agent_id TEXT REFERENCES agents(id),
    from_status TEXT,
    to_status TEXT,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    avatar_url TEXT,
    provider TEXT NOT NULL CHECK(provider IN ('google','github')),
    provider_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_id)
  );

  CREATE TABLE IF NOT EXISTS project_members (
    id SERIAL PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS id_sequences (
    project_id TEXT NOT NULL,
    type TEXT NOT NULL,
    seq INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (project_id, type)
  );

  CREATE TABLE IF NOT EXISTS story_links (
    id TEXT PRIMARY KEY,
    from_story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    to_story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    link_type TEXT NOT NULL CHECK (link_type IN ('blocks', 'duplicates', 'relates_to')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (from_story_id != to_story_id),
    UNIQUE (from_story_id, to_story_id, link_type)
  );

  CREATE INDEX IF NOT EXISTS idx_story_links_from ON story_links(from_story_id);
  CREATE INDEX IF NOT EXISTS idx_story_links_to ON story_links(to_story_id);

  ALTER TABLE epics ADD COLUMN IF NOT EXISTS source_doc TEXT;
`

// No separate MIGRATIONS array needed — schema is idempotent with IF NOT EXISTS.
// Future changes: add new CREATE TABLE IF NOT EXISTS or ALTER TABLE ... ADD COLUMN IF NOT EXISTS here.
export const MIGRATIONS: string[] = []
