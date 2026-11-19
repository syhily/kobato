import type { AppLocale } from '@kobato/i18n/locales.ts'

import { SUPPORTED_LOCALES } from '@kobato/i18n/locales.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const imports = vi.hoisted(() => ({ loaded: [] as string[] }))

vi.mock('@kobato/i18n/inkling-labels/en-US.ts', () => {
  imports.loaded.push('en-US')
  return { kobatoInklingLabelsEnUS: { 'placeholder.editor': 'EN labels' } }
})
vi.mock('@kobato/i18n/inkling-labels/zh-CN.ts', () => {
  imports.loaded.push('zh-CN')
  return { kobatoInklingLabelsZhCN: { 'placeholder.editor': 'ZH-CN labels' } }
})
vi.mock('@kobato/i18n/inkling-labels/zh-HK.ts', () => {
  imports.loaded.push('zh-HK')
  return { kobatoInklingLabelsZhHK: { 'placeholder.editor': 'ZH-HK labels' } }
})
vi.mock('@kobato/i18n/inkling-labels/zh-TW.ts', () => {
  imports.loaded.push('zh-TW')
  return { kobatoInklingLabelsZhTW: { 'placeholder.editor': 'ZH-TW labels' } }
})

const LABEL: Record<AppLocale, string> = {
  'en-US': 'EN labels',
  'zh-CN': 'ZH-CN labels',
  'zh-HK': 'ZH-HK labels',
  'zh-TW': 'ZH-TW labels',
}

describe('client/editor/inkling-labels — lazy per-locale chunks', () => {
  beforeEach(() => {
    vi.resetModules()
    imports.loaded.length = 0
  })

  it.each(SUPPORTED_LOCALES)('loads only the %s table chunk', async (locale) => {
    const { loadInklingLabels } = await import('@kobato/web-client/editor/inkling-labels.ts')

    const table = await loadInklingLabels(locale)

    expect(imports.loaded).toEqual([locale])
    expect(table['placeholder.editor']).toBe(LABEL[locale])
  })
})
