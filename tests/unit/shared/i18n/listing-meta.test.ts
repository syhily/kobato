import { describe, expect, it } from 'vitest'

import { makeTranslator } from '#/_helpers/i18n'

// `listingSeo` (owned by the HTTP slice) renders paginated listing titles from
// these two keys. They are reserved here so the four locales stay in step:
// en-US says "Page {page}", the Chinese catalogs say "第 {page} 页/頁".
describe('shared/i18n — meta.listing keys', () => {
  it('formats the bare page title in every locale', () => {
    expect(makeTranslator('en-US')('meta.listing.page', { page: 3 })).toBe('Page 3')
    expect(makeTranslator('zh-CN')('meta.listing.page', { page: 3 })).toBe('第 3 页')
    expect(makeTranslator('zh-HK')('meta.listing.page', { page: 3 })).toBe('第 3 頁')
    expect(makeTranslator('zh-TW')('meta.listing.page', { page: 3 })).toBe('第 3 頁')
  })

  it('formats the titled page with the site title first', () => {
    expect(makeTranslator('en-US')('meta.listing.titleWithPage', { title: 'Archive', page: 2 })).toBe(
      'Archive · Page 2',
    )
    expect(makeTranslator('zh-CN')('meta.listing.titleWithPage', { title: '归档', page: 2 })).toBe('归档 · 第 2 页')
    expect(makeTranslator('zh-HK')('meta.listing.titleWithPage', { title: '封存', page: 2 })).toBe('封存 · 第 2 頁')
    expect(makeTranslator('zh-TW')('meta.listing.titleWithPage', { title: '封存', page: 2 })).toBe('封存 · 第 2 頁')
  })
})
