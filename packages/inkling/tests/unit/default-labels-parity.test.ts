import { kobatoInklingLabelsEnUS } from '@kobato/i18n/inkling-labels/en-US.ts'
import { DEFAULT_LABELS } from '@kobato/inkling'
import { describe, expect, it } from 'vitest'

const EN_LABELS = kobatoInklingLabelsEnUS as Record<string, string>

const HOST_MENU_KEYS = [
  'menu.host.solution.label',
  'menu.host.solution.desc',
  'menu.host.two-column.label',
  'menu.host.two-column.desc',
  'menu.host.music-player.label',
  'menu.host.music-player.desc',
] as const

describe('i18n/inkling-labels — built-in parity', () => {
  it('keeps every built-in English value byte-identical to Inkling DEFAULT_LABELS', () => {
    for (const key of Object.keys(kobatoInklingLabelsEnUS)) {
      if ((HOST_MENU_KEYS as readonly string[]).includes(key)) {
        continue
      }
      expect(EN_LABELS[key]).toBe(DEFAULT_LABELS[key as keyof typeof DEFAULT_LABELS])
    }
  })
})
