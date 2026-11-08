import { describe, expect, it } from 'vitest'

import { makeTranslator } from '#/_helpers/i18n'
import { TASK_CATALOG } from '@/shared/contracts/jobs'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'
import { TASK_CAPABILITIES } from '@/ui/admin/tasks/meta'

// The task catalog is a NEUTRAL registry: every user-facing field is a UI
// message id, so the admin task center can render all four locales. A copy
// regression (a label reverted to prose) fails here and in the Han-literal scan.
const HAN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/

const MESSAGE_FIELDS = ['label', 'description', 'scheduleHint'] as const

describe('shared/contracts/jobs — TASK_CATALOG', () => {
  it('keys every display field by message id, never prose', () => {
    for (const task of TASK_CATALOG) {
      for (const field of MESSAGE_FIELDS) {
        expect(task[field]).toMatch(/^admin\.tasks\.task\.[A-Za-z0-9]+\.(label|description|schedule)$/)
        expect(HAN.test(task[field])).toBe(false)
      }
    }
  })

  it('resolves every catalog message in all four locales', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const t = makeTranslator(locale)
      for (const task of TASK_CATALOG) {
        for (const field of MESSAGE_FIELDS) {
          const rendered = t(task[field])
          expect(rendered, `${locale} ${task[field]}`).not.toBe(task[field])
          expect(rendered.trim().length).toBeGreaterThan(0)
        }
      }
    }
  })

  it('has one capability row and one unique message-id set per task', () => {
    expect(Object.keys(TASK_CAPABILITIES).sort()).toEqual(TASK_CATALOG.map((task) => task.key).sort())
    expect(new Set(TASK_CATALOG.map((task) => task.key)).size).toBe(TASK_CATALOG.length)
    for (const task of TASK_CATALOG) {
      expect(TASK_CAPABILITIES[task.key]).toBeDefined()
    }
  })
})
