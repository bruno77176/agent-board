import { describe, it, expect, beforeEach } from 'vitest'
import { getDb, closeDb } from '../src/db/index.js'
import { seed } from '../src/db/seed.js'

describe('seed', () => {
  beforeEach(() => closeDb())

  it('inserts 3 workflows', () => {
    const db = getDb(':memory:')
    seed(db)
    const workflows = db.prepare('SELECT * FROM workflows').all()
    expect(workflows).toHaveLength(3)
  })

  it('inserts 10 agents', () => {
    const db = getDb(':memory:')
    seed(db)
    const agents = db.prepare('SELECT slug FROM agents').all() as {slug:string}[]
    const slugs = agents.map(a => a.slug)
    expect(slugs).toContain('tess-ter')
    expect(slugs).toContain('arch-lee')
    expect(slugs).toContain('dee-ploy')
    expect(slugs).toContain('deb-ugg')
    expect(slugs).toContain('rev-yu')
    expect(slugs).toContain('dev-in')
    expect(slugs).toContain('fron-tina')
    expect(slugs).toContain('doc-tor')
    expect(slugs).toContain('pip-lynn')
  })

  it('is idempotent (safe to run twice)', () => {
    const db = getDb(':memory:')
    seed(db)
    seed(db)
    const agents = db.prepare('SELECT * FROM agents').all()
    expect(agents).toHaveLength(10)
  })
})
