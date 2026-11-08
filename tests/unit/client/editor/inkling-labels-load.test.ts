// The public comment composer fetches its label table on demand. Each locale
// lives in its own module, so the bundler emits FOUR small chunks and a visitor
// downloads exactly the active UI locale's one — never all four. This pins the
// loader mapping; the component-side gating is covered by
// `ui/public/comments/lazy-comment-body-editor.test.tsx`.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppLocale } from '@/shared/i18n/locales'

import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

const imports = vi.hoisted(() => ({ loaded: [] as string[] }))

vi.mock('@/shared/i18n/inkling-labels/en-US', () => {
  imports.loaded.push('en-US')
  return { kobatoInklingLabelsEnUS: { 'placeholder.editor': 'EN labels' } }
})
vi.mock('@/shared/i18n/inkling-labels/zh-CN', () => {
  imports.loaded.push('zh-CN')
  return { kobatoInklingLabelsZhCN: { 'placeholder.editor': 'ZH-CN labels' } }
})
vi.mock('@/shared/i18n/inkling-labels/zh-HK', () => {
  imports.loaded.push('zh-HK')
  return { kobatoInklingLabelsZhHK: { 'placeholder.editor': 'ZH-HK labels' } }
})
vi.mock('@/shared/i18n/inkling-labels/zh-TW', () => {
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
    // Fresh module registry per case, so the factories record THAT call's imports.
    vi.resetModules()
    imports.loaded.length = 0
  })

  it.each(SUPPORTED_LOCALES)('loads only the %s table chunk', async (locale) => {
    const { loadInklingLabels } = await import('@/client/editor/inkling-labels')

    const table = await loadInklingLabels(locale)

    expect(imports.loaded).toEqual([locale])
    expect(table['placeholder.editor']).toBe(LABEL[locale])
  })
})
