// @vitest-environment happy-dom

// The four per-locale Kobato Inkling overlays. The compile-time guarantee is
// `satisfies` (en table -> InklingLabelsInput; the other three ->
// Record<KobatoInklingLabelKey, string>); this suite pins the RUNTIME contract
// that the types cannot: the used-key set, the interpolation tokens, and the
// locale selection.

import { describe, expect, it } from 'vitest'

import { kobatoInklingLabels } from '@/client/editor/inkling-labels'
import { kobatoInklingLabelsEnUS, type KobatoInklingLabelKey } from '@/client/editor/inkling-labels/en-US'
import { kobatoInklingLabelsZhCN } from '@/client/editor/inkling-labels/zh-CN'
import { kobatoInklingLabelsZhHK } from '@/client/editor/inkling-labels/zh-HK'
import { kobatoInklingLabelsZhTW } from '@/client/editor/inkling-labels/zh-TW'
import { DEFAULT_LABELS } from '@/inkling'

const EN_KEYS = Object.keys(kobatoInklingLabelsEnUS).sort() as KobatoInklingLabelKey[]

const TABLES = {
  'en-US': kobatoInklingLabelsEnUS,
  'zh-CN': kobatoInklingLabelsZhCN,
  'zh-TW': kobatoInklingLabelsZhTW,
  'zh-HK': kobatoInklingLabelsZhHK,
} as const

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

describe('client/editor/inkling-labels — used-key parity', () => {
  it('covers exactly the 157 mounted keys', () => {
    // 156 + `image.altToggle` (the caption editor's alt toggle, Step 6b).
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

  it('sources every built-in English value from Inkling DEFAULT_LABELS', () => {
    for (const key of EN_KEYS) {
      if ((HOST_MENU_KEYS as readonly string[]).includes(key)) {
        continue
      }
      expect(kobatoInklingLabelsEnUS[key]).toBe(DEFAULT_LABELS[key as keyof typeof DEFAULT_LABELS])
    }
  })

  it('has a non-empty translation for every key in every locale', () => {
    for (const [locale, table] of Object.entries(TABLES)) {
      for (const key of EN_KEYS) {
        expect(table[key].length, `${locale} ${key}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('client/editor/inkling-labels — interpolation tokens', () => {
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

describe('client/editor/inkling-labels — locale selection', () => {
  it('returns the matching table for each supported locale', () => {
    expect(kobatoInklingLabels('en-US')).toBe(kobatoInklingLabelsEnUS)
    expect(kobatoInklingLabels('zh-CN')).toBe(kobatoInklingLabelsZhCN)
    expect(kobatoInklingLabels('zh-TW')).toBe(kobatoInklingLabelsZhTW)
    expect(kobatoInklingLabels('zh-HK')).toBe(kobatoInklingLabelsZhHK)
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
