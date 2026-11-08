import { describe, expect, it } from 'vitest'
import { parseChangelog, parseInline } from './changelog'
import changelogSource from 'virtual:changelog'

const SAMPLE = `# Changelog

Intro text that is not part of any release.

## [Unreleased] - 2026-11-06

### Fixed
- Workshop thumbnails stack their rows.

## [1.2.33] - 2026-11-05

Notes for conversions.

### Added
- **Notes** on each conversion.
- Search by \`notes\`.

### Changed
- One change.

## [1.0.0]
`

describe('parseChangelog', () => {
  it('reads releases newest first with their groups', () => {
    const releases = parseChangelog(SAMPLE)
    expect(releases.map((release) => release.version)).toEqual(['Unreleased', '1.2.33'])
    expect(releases[1]).toEqual({
      version: '1.2.33',
      date: '2026-11-05',
      summary: 'Notes for conversions.',
      groups: [
        { kind: 'added', items: ['**Notes** on each conversion.', 'Search by `notes`.'] },
        { kind: 'changed', items: ['One change.'] },
      ],
    })
  })

  it('handles CRLF line endings', () => {
    expect(parseChangelog(SAMPLE.replace(/\n/g, '\r\n'))).toEqual(parseChangelog(SAMPLE))
  })

  it('parses the shipped CHANGELOG.md into dated releases with changes', () => {
    const releases = parseChangelog(changelogSource)
    expect(releases.length).toBeGreaterThan(5)
    for (const release of releases) {
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(release.groups.length).toBeGreaterThan(0)
    }
  })
})

describe('parseInline', () => {
  it('splits code and bold runs', () => {
    expect(parseInline('Use **Library** and `notes` now')).toEqual([
      { type: 'text', text: 'Use ' },
      { type: 'strong', text: 'Library' },
      { type: 'text', text: ' and ' },
      { type: 'code', text: 'notes' },
      { type: 'text', text: ' now' },
    ])
  })
})
