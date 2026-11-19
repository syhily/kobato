import {
  adminSendBroadcastInput,
  adminSendDirectInput,
  replyNotificationInput,
} from '@kobato/contracts/notifications.ts'
import { SUPPORTED_LOCALES } from '@kobato/i18n/locales.ts'
import { uiMessagesEnUS } from '@kobato/i18n/messages/ui/en-US.ts'
import { makeTranslator } from '@kobato/test/i18n.ts'
import { describe, expect, it } from 'vitest'

const HAN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/

const CASES = [
  {
    name: 'reply body',
    parse: () => replyNotificationInput.safeParse({ threadId: '1', body: '   ' }),
    messageKey: 'notifications.validation.replyBody',
    path: ['body'],
  },
  {
    name: 'direct title',
    parse: () => adminSendDirectInput.safeParse({ userId: '1', title: '  ', body: 'hello' }),
    messageKey: 'notifications.validation.title',
    path: ['title'],
  },
  {
    name: 'direct body',
    parse: () => adminSendDirectInput.safeParse({ userId: '1', title: 'hello', body: '  ' }),
    messageKey: 'notifications.validation.body',
    path: ['body'],
  },
  {
    name: 'broadcast title',
    parse: () => adminSendBroadcastInput.safeParse({ title: '', body: 'hello' }),
    messageKey: 'notifications.validation.title',
    path: ['title'],
  },
  {
    name: 'broadcast body',
    parse: () => adminSendBroadcastInput.safeParse({ title: 'hello', body: '' }),
    messageKey: 'notifications.validation.body',
    path: ['body'],
  },
] as const

describe('contracts/notifications — validation message ids', () => {
  it('emits a catalog id (never prose) for every empty-field issue', () => {
    for (const testCase of CASES) {
      const result = testCase.parse()
      if (result.success) {
        throw new Error(`${testCase.name} unexpectedly parsed`)
      }
      const issue = result.error.issues[0]!
      expect(issue.message, testCase.name).toBe(testCase.messageKey)
      expect(issue.path).toEqual(testCase.path)
      expect(HAN.test(issue.message)).toBe(false)
      expect(Object.hasOwn(uiMessagesEnUS, issue.message)).toBe(true)
    }
  })

  it('resolves every validation id in all four locales', () => {
    const keys = [
      'notifications.validation.replyBody',
      'notifications.validation.title',
      'notifications.validation.body',
    ] as const
    for (const locale of SUPPORTED_LOCALES) {
      const t = makeTranslator(locale)
      for (const key of keys) {
        expect(t(key), `${locale} ${key}`).not.toBe(key)
      }
    }
  })
})
