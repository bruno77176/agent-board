import { describe, it, expect } from 'vitest'
import { parseFrontmatter } from '../src/lib/doc-parser.js'

describe('parseFrontmatter', () => {
  it('parses project key from frontmatter', () => {
    const content = '---\nproject: BOARD\ntype: plan\n---\n# Title\n'
    const { data, body } = parseFrontmatter(content)
    expect(data.project).toBe('BOARD')
    expect(body).toContain('# Title')
  })

  it('returns empty data when no frontmatter', () => {
    const { data } = parseFrontmatter('# Just a heading\n')
    expect(data).toEqual({})
  })
})

function planDisplayName(source_doc: string): string {
  const filename = source_doc.split('/').pop() ?? source_doc
  return filename
    .replace(/\.md$/, '')
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .split('-')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

describe('planDisplayName', () => {
  it('converts dated filename to readable name', () => {
    expect(planDisplayName('plans/2026-04-05-story-time-tracking.md')).toBe('Story Time Tracking')
  })

  it('handles filename without date prefix', () => {
    expect(planDisplayName('plans/my-feature.md')).toBe('My Feature')
  })

  it('handles just the filename with date', () => {
    expect(planDisplayName('2026-04-05-doc-watcher-cleanup.md')).toBe('Doc Watcher Cleanup')
  })
})
