import { describe, expect, it } from 'vitest'

import { filterSlashCommands, SLASH_COMMANDS } from '@/ui/admin/editor/tiptap/slash-commands'

// The catalogue is the authoritative source of truth for what the `/`
// menu shows; this suite locks down its contract so a refactor that
// drops a command or breaks the alias-matching collapses here instead
// of silently going to production.

describe('slash-commands', () => {
  it('exposes a stable catalogue with unique ids', () => {
    expect(SLASH_COMMANDS.length).toBeGreaterThan(0)
    const ids = SLASH_COMMANDS.map((cmd) => cmd.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('includes the table command (B7-2 contract)', () => {
    expect(SLASH_COMMANDS.some((cmd) => cmd.id === 'table')).toBe(true)
  })

  it('includes media + custom-block pickers', () => {
    const ids = SLASH_COMMANDS.map((cmd) => cmd.id)
    for (const expected of ['image', 'music', 'math-block', 'solution', 'two-columns', 'footnote']) {
      expect(ids).toContain(expected)
    }
  })

  it('returns the full catalogue for an empty query', () => {
    expect(filterSlashCommands('').length).toBe(SLASH_COMMANDS.length)
    expect(filterSlashCommands('   ').length).toBe(SLASH_COMMANDS.length)
  })

  it('matches by title prefix (case-insensitive)', () => {
    const out = filterSlashCommands('表格')
    expect(out.some((cmd) => cmd.id === 'table')).toBe(true)
  })

  it('matches by alias', () => {
    const out = filterSlashCommands('tex')
    expect(out.some((cmd) => cmd.id === 'math-block')).toBe(true)
  })

  it('returns empty when nothing matches', () => {
    expect(filterSlashCommands('zzzzz-not-a-real-command-zzzzz').length).toBe(0)
  })
})
