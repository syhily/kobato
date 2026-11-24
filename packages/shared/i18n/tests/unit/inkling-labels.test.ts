// @vitest-environment happy-dom

import { inklingLabelsFor } from '@kobato/i18n/inkling-labels'
import {
  kobatoInklingLabelsEnUS,
  type KobatoInklingLabelKey,
  type KobatoInklingLabelTable,
} from '@kobato/i18n/inkling-labels/en-US'
import { kobatoInklingLabelsZhCN } from '@kobato/i18n/inkling-labels/zh-CN'
import { kobatoInklingLabelsZhHK } from '@kobato/i18n/inkling-labels/zh-HK'
import { kobatoInklingLabelsZhTW } from '@kobato/i18n/inkling-labels/zh-TW'
import { describe, expect, it } from 'vitest'

const EN_KEYS = Object.keys(kobatoInklingLabelsEnUS).sort() as KobatoInklingLabelKey[]

const TABLES = {
  'en-US': kobatoInklingLabelsEnUS,
  'zh-CN': kobatoInklingLabelsZhCN,
  'zh-TW': kobatoInklingLabelsZhTW,
  'zh-HK': kobatoInklingLabelsZhHK,
} as const satisfies Record<string, KobatoInklingLabelTable>

const HOST_MENU_KEYS = [
  'menu.host.solution.label',
  'menu.host.solution.desc',
  'menu.host.two-column.label',
  'menu.host.two-column.desc',
  'menu.host.music-player.label',
  'menu.host.music-player.desc',
] as const

const UNMOUNTED_FEATURE_PREFIXES = ['gif.', 'menu.gif.', 'pintura.', 'snippet.', 'toolbar.saveAsSnippet']

function tokensIn(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort()
}

describe('i18n/inkling-labels — used-key parity', () => {
  it('covers exactly the 157 mounted keys', () => {
    expect(EN_KEYS).toHaveLength(157)
    for (const [locale, table] of Object.entries(TABLES)) {
      expect(Object.keys(table).sort(), locale).toEqual(EN_KEYS)
    }
  })

  it('includes the host-card menu namespace and skips unmounted features', () => {
    for (const key of HOST_MENU_KEYS) {
      expect(EN_KEYS).toContain(key)
    }
    for (const key of EN_KEYS) {
      for (const prefix of UNMOUNTED_FEATURE_PREFIXES) {
        expect(key.startsWith(prefix), key).toBe(false)
      }
    }
  })
})

describe('i18n/inkling-labels — interpolation tokens', () => {
  it('preserves every {token} of the English text per locale', () => {
    for (const key of EN_KEYS) {
      const expected = tokensIn(kobatoInklingLabelsEnUS[key])
      for (const [locale, table] of Object.entries(TABLES)) {
        expect(tokensIn(table[key]), `${locale} ${key}`).toEqual(expected)
      }
    }
  })

  it('keeps the gallery/token-bearing keys intact', () => {
    const expectations = {
      'upload.gallery.desc': ['max'],
      'media.dragText.addToGallery': ['max'],
      'aria.indicator': ['cardType'],
      'alt.imageUploadProgress': ['progress'],
    } as const satisfies Partial<Record<KobatoInklingLabelKey, readonly string[]>>
    for (const [key, tokens] of Object.entries(expectations)) {
      for (const [locale, table] of Object.entries(TABLES)) {
        expect(tokensIn(table[key as KobatoInklingLabelKey]), `${locale} ${key}`).toEqual(tokens)
      }
    }
  })
})

describe('i18n/inkling-labels — locale selection', () => {
  it('returns the matching table for each supported locale', () => {
    expect(inklingLabelsFor('en-US')).toBe(kobatoInklingLabelsEnUS)
    expect(inklingLabelsFor('zh-CN')).toBe(kobatoInklingLabelsZhCN)
    expect(inklingLabelsFor('zh-TW')).toBe(kobatoInklingLabelsZhTW)
    expect(inklingLabelsFor('zh-HK')).toBe(kobatoInklingLabelsZhHK)
  })

  it('keeps the pre-i18n zh-CN copy stable', () => {
    expect(kobatoInklingLabelsZhCN['placeholder.editor']).toBe('开始撰写内容…')
    expect(kobatoInklingLabelsZhCN['menu.host.solution.label']).toBe('解答块')
    expect(kobatoInklingLabelsZhCN['toolbar.bold']).toBe('加粗')
  })

  it('uses independently written Traditional Chinese tables', () => {
    expect(kobatoInklingLabelsZhTW['menu.codeblock.label']).toBe('程式碼區塊')
    expect(kobatoInklingLabelsZhTW['toolbar.bold']).toBe('粗體')
    expect(kobatoInklingLabelsZhHK['media.dragText.single']).toBe('放開以插入')
    expect(kobatoInklingLabelsZhHK['menu.header.label']).toBe('頁首')
  })
})
