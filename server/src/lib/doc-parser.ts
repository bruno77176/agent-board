/**
 * Parse YAML frontmatter from a markdown string.
 * Returns data object and the body (without frontmatter).
 */
export function parseFrontmatter(content: string): { data: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { data: {}, body: content }
  const data: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim()
      const value = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '')
      if (key) data[key] = value
    }
  }
  return { data, body: match[2] }
}
