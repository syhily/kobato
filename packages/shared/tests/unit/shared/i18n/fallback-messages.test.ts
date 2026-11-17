import { FALLBACK_MESSAGE_IDS, fallbackMessages } from '@kobato/shared/i18n/fallback-messages.ts'
import { uiMessagesEnUS } from '@kobato/shared/i18n/messages/ui/en-US.ts'
import { uiMessagesZhCN } from '@kobato/shared/i18n/messages/ui/zh-CN.ts'
import { describe, expect, it } from 'vitest'

describe('shared/i18n/fallback-messages', () => {
  it('only names ids that exist in the English baseline', () => {
    for (const id of FALLBACK_MESSAGE_IDS) {
      expect(Object.hasOwn(uiMessagesEnUS, id)).toBe(true)
    }
    expect(Object.keys(fallbackMessages).sort()).toEqual([...FALLBACK_MESSAGE_IDS].sort())
  })

  it('stays byte-identical to the Simplified Chinese catalog', () => {
    // The module duplicates these strings on purpose (importing the catalog
    // would pull the whole corpus into the client graph) — this is the pin.
    for (const id of FALLBACK_MESSAGE_IDS) {
      expect(fallbackMessages[id]).toBe(uiMessagesZhCN[id])
    }
  })
})
