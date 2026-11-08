// Reads the repo's CHANGELOG.md (Keep a Changelog layout) into releases for the Changelog dialog.
// Only the parts the file uses are understood: `## [version] - YYYY-MM-DD`, an optional summary
// paragraph, `### Added|Changed|Fixed|Removed` groups and one-line `- ` bullets with `code` and **bold**.

export type ChangeKind = 'added' | 'changed' | 'fixed' | 'removed'

export interface ChangeGroup {
  kind: ChangeKind
  items: string[]
}

export interface Release {
  version: string
  /** `YYYY-MM-DD`, or empty when the heading has no date. */
  date: string
  summary: string
  groups: ChangeGroup[]
}

export type InlinePart = { type: 'text' | 'code' | 'strong'; text: string }

const RELEASE_HEADING = /^##\s+\[?([^\]\s]+)\]?(?:\s+-\s+(\d{4}-\d{2}-\d{2}))?\s*$/
const GROUP_HEADING = /^###\s+(Added|Changed|Fixed|Removed)\s*$/i

export function parseChangelog(source: string): Release[] {
  const releases: Release[] = []
  let release: Release | null = null
  let group: ChangeGroup | null = null

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    const releaseMatch = RELEASE_HEADING.exec(line)
    if (releaseMatch) {
      release = { version: releaseMatch[1], date: releaseMatch[2] ?? '', summary: '', groups: [] }
      releases.push(release)
      group = null
      continue
    }
    if (!release) continue

    const groupMatch = GROUP_HEADING.exec(line)
    if (groupMatch) {
      const kind = groupMatch[1].toLowerCase() as ChangeKind
      group = release.groups.find((existing) => existing.kind === kind) ?? null
      if (!group) {
        group = { kind, items: [] }
        release.groups.push(group)
      }
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      const item = line.replace(/^[-*]\s+/, '')
      if (!group) {
        group = { kind: 'changed', items: [] }
        release.groups.push(group)
      }
      group.items.push(item)
      continue
    }

    // A paragraph before the first group is the release summary.
    if (line && !line.startsWith('#') && release.groups.length === 0) {
      release.summary = release.summary ? `${release.summary} ${line}` : line
    }
  }

  return releases.filter((entry) => entry.groups.some((item) => item.items.length > 0) || entry.summary)
}

/** Splits a bullet into plain text, `code` and **bold** runs. */
export function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = []
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ type: 'text', text: text.slice(last, index) })
    parts.push(match[1] !== undefined ? { type: 'code', text: match[1] } : { type: 'strong', text: match[2] })
    last = index + match[0].length
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) })
  return parts
}
