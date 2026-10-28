// Per-post presentation settings live in a small frontmatter block at the top
// of the markdown file: `key: value` lines fenced by `---`. Only the keys below
// are interpreted; anything else is preserved so future settings don't get
// dropped when a post is edited.
export type PostEffect = 'none' | 'hearts' | 'bubbles' | 'sparkles' | 'snow'

export const POST_EFFECTS: { value: PostEffect; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'hearts', label: 'Hearts' },
  { value: 'bubbles', label: 'Bubbles' },
  { value: 'sparkles', label: 'Sparkles' },
  { value: 'snow', label: 'Snow' },
]

export interface PostMeta {
  /** Background music URL (repo media URL, possibly an encrypted `.enc` file). */
  music?: string
  effect?: PostEffect
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0]
    if ((first === '"' || first === "'") && value.endsWith(first)) return value.slice(1, -1)
  }
  return value
}

// Raw fields, in file order, so a rewrite keeps unknown keys and formatting.
function readFields(src: string): { fields: [string, string][]; body: string } {
  const match = FRONTMATTER.exec(src)
  if (!match) return { fields: [], body: src }
  const fields: [string, string][] = []
  for (const line of match[1]!.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const at = line.indexOf(':')
    if (at < 1) continue
    fields.push([line.slice(0, at).trim(), unquote(line.slice(at + 1).trim())])
  }
  return { fields, body: src.slice(match[0].length) }
}

export function parseFrontmatter(src: string): { meta: PostMeta; body: string } {
  const { fields, body } = readFields(src)
  const values = new Map(fields)
  const meta: PostMeta = {}
  const music = values.get('music')
  if (music) meta.music = music
  const effect = values.get('effect')?.toLowerCase()
  if (effect && POST_EFFECTS.some((e) => e.value === effect)) meta.effect = effect as PostEffect
  return { meta, body }
}

// Set or clear keys (an empty/undefined value removes the key). The body is
// left byte-for-byte alone; an empty header removes the whole block.
export function setFrontmatter(src: string, patch: Record<string, string | undefined>): string {
  const { fields, body } = readFields(src)
  const merged = new Map(fields)
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || !value.trim()) merged.delete(key)
    else merged.set(key, value.trim())
  }
  if (!merged.size) return body
  const header = [...merged].map(([key, value]) => `${key}: ${value}`).join('\n')
  return `---\n${header}\n---\n${body}`
}
