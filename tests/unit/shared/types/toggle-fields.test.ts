import { describe, expect, it } from 'vitest'

import { makeTranslator } from '#/_helpers/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'
import { uiMessagesEnUS } from '@/shared/i18n/messages/ui/en-US'
import { PAGE_META_TOGGLE_FIELDS } from '@/shared/types/pages'
import { POST_META_TOGGLE_FIELDS } from '@/shared/types/posts'

// The editor toggle rows are neutral registries: ToggleOptionsCard resolves
// `labelId` / `descriptionId` through `useI18n()`. Keeping ids here (instead of
// Chinese prose) is what lets the same sidebar render four locales.
const HAN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/

const FIELDS = [...POST_META_TOGGLE_FIELDS, ...PAGE_META_TOGGLE_FIELDS]

describe('shared/types toggle fields — message-id registries', () => {
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
