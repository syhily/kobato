import { SUPPORTED_LOCALES } from '@kobato/i18n/locales.ts'
import { uiMessagesEnUS } from '@kobato/i18n/messages/ui/en-US.ts'
import { makeTranslator } from '@kobato/web-admin/tests/utils/i18n.ts'
import { PAGE_META_TOGGLE_FIELDS } from '@kobato/web-admin/ui/pages/page-meta.ts'
import { POST_META_TOGGLE_FIELDS } from '@kobato/web-admin/ui/posts/post-meta.ts'
import { describe, expect, it } from 'vitest'

const HAN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/

const FIELDS = [...POST_META_TOGGLE_FIELDS, ...PAGE_META_TOGGLE_FIELDS]

describe('editor toggle fields — message-id registries', () => {
  it('carries catalog ids rather than prose', () => {
    for (const field of FIELDS) {
      for (const key of [field.labelId, field.descriptionId]) {
        expect(key).toMatch(/^admin\.editor\.toggle\.(post|page)\.[A-Za-z0-9]+\.(label|description)$/)
        expect(HAN.test(key)).toBe(false)
        expect(Object.hasOwn(uiMessagesEnUS, key)).toBe(true)
      }
    }
  })

  it('resolves every toggle label and description in all four locales', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const t = makeTranslator(locale)
      for (const field of FIELDS) {
        for (const key of [field.labelId, field.descriptionId]) {
          const rendered = t(key)
          expect(rendered, `${locale} ${key}`).not.toBe(key)
          expect(rendered.trim().length).toBeGreaterThan(0)
        }
      }
    }
  })
})
