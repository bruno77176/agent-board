/**
 * Test helpers for postgres.js-based tests.
 *
 * Requires TEST_DATABASE_URL env var pointing at a real Postgres instance.
 * Each test suite should call setupTestDb() in beforeEach and teardown in afterEach/afterAll.
 */
import postgres from 'postgres'
import { SCHEMA } from '../src/db/schema.js'
import { seed } from '../src/db/seed.js'

export function getTestDatabaseUrl(): string | undefined {
  return process.env.TEST_DATABASE_URL
}

export function skipIfNoDb() {
  if (!process.env.TEST_DATABASE_URL) {
    console.warn('Skipping: TEST_DATABASE_URL not set')
    return true
  }
  return false
}

/**
 * Creates a fresh isolated postgres.js connection with a clean schema.
 * Drops and recreates all tables so tests start from a blank slate.
 */
export async function createTestSql(): Promise<postgres.Sql> {
  const url = process.env.TEST_DATABASE_URL
  if (!url) throw new Error('TEST_DATABASE_URL env var is required for tests')

  const sql = postgres(url, { max: 5, ssl: false })

  // Drop all tables in reverse dependency order to start fresh
  await sql.unsafe(`
    DROP TABLE IF EXISTS story_links CASCADE;
    DROP TABLE IF EXISTS events CASCADE;
    DROP TABLE IF EXISTS stories CASCADE;
    DROP TABLE IF EXISTS features CASCADE;
    DROP TABLE IF EXISTS epics CASCADE;
    DROP TABLE IF EXISTS project_members CASCADE;
    DROP TABLE IF EXISTS projects CASCADE;
    DROP TABLE IF EXISTS id_sequences CASCADE;
    DROP TABLE IF EXISTS agents CASCADE;
    DROP TABLE IF EXISTS workflows CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
  `)

  // Re-create schema
  await sql.unsafe(SCHEMA)

  return sql
}

export async function closeTestSql(sql: postgres.Sql): Promise<void> {
  await sql.end()
}

export async function createSeededTestSql(): Promise<postgres.Sql> {
  const sql = await createTestSql()
  await seed(sql)
  return sql
}
