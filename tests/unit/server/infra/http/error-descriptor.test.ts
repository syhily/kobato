import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import type { ErrorMessageDescriptor } from '@/shared/contracts/api-error'

import {
  descriptorFor,
  descriptorMessage,
  isUiMessageId,
  messageDescriptor,
  RAW_MESSAGE_KEY,
  rawMessageDescriptor,
  zodIssueToWire,
  zodIssuesToWire,
} from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { rateLimitBucketMessages } from '@/shared/config/rate-limit-bucket'
import { SUPPORTED_LOCALES, type AppLocale } from '@/shared/i18n/locales'
import { uiMessagesEnUS } from '@/shared/i18n/messages/ui/en-US'

describe('server/infra/http/error-descriptor — message ids', () => {
  it('recognizes catalog ids and rejects other strings', () => {
    expect(isUiMessageId('error.api.notFound')).toBe(true)
    expect(isUiMessageId('admin.settings.rateLimit.error.windowMin')).toBe(true)
    expect(isUiMessageId('missing.key')).toBe(false)
    expect(isUiMessageId('资源不存在。')).toBe(false)
  })

  it('wraps legacy raw text in the passthrough key', () => {
    expect(rawMessageDescriptor('设置数据无效')).toEqual({
      messageKey: RAW_MESSAGE_KEY,
      params: { message: '设置数据无效' },
      fallbackMessage: '设置数据无效',
    })
  })

  it('renders the English fallback eagerly, params included', () => {
    expect(descriptorFor('admin.settings.rateLimit.error.windowMin', { min: 60 })).toEqual({
      messageKey: 'admin.settings.rateLimit.error.windowMin',
      params: { min: 60 },
      fallbackMessage: 'The time window must be at least 60 seconds',
    })
    // The fallback is the English catalog, never the id and never a template.
    expect(descriptorFor('error.api.notFound').fallbackMessage).toBe(uiMessagesEnUS['error.api.notFound'])
  })

  it('distinguishes catalog ids from prose in an untyped message', () => {
    expect(messageDescriptor('error.api.conflict').messageKey).toBe('error.api.conflict')
    expect(messageDescriptor('Something technical happened')).toEqual(
      rawMessageDescriptor('Something technical happened'),
    )
  })
})

describe('server/infra/http/error-descriptor — Zod issues', () => {
  it('maps a typed custom message + bound into descriptor, code and path', () => {
    const schema = z.object({
      signIn: z.object({
        windowSeconds: z.coerce.number().min(60, rateLimitBucketMessages.windowMin),
      }),
    })
    const parsed = schema.safeParse({ signIn: { windowSeconds: 59 } })
    expect(parsed.success).toBe(false)
    const issue = parsed.error!.issues[0]!

    expect(zodIssueToWire(issue)).toEqual({
      messageKey: 'admin.settings.rateLimit.error.windowMin',
      params: { min: 60 },
      fallbackMessage: 'The time window must be at least 60 seconds',
      message: 'The time window must be at least 60 seconds',
      code: 'too_small',
      path: ['signIn', 'windowSeconds'],
    })
  })

  it('resolves the issue message in every request locale, keeping the English fallback', () => {
    const parsed = z.object({ windowSeconds: z.coerce.number().min(60, rateLimitBucketMessages.windowMin) }).safeParse({
      windowSeconds: 59,
    })
    expect(parsed.success).toBe(false)
    const issue = parsed.error!.issues[0]!
    const expected: Record<AppLocale, string> = {
      'en-US': 'The time window must be at least 60 seconds',
      'zh-CN': '时间窗口不能小于 60 秒',
      'zh-TW': '時間視窗不能小於 60 秒',
      'zh-HK': '時間視窗不能小於 60 秒',
    }

    for (const locale of SUPPORTED_LOCALES) {
      const wire = zodIssueToWire(issue, createServerTranslator(locale))
      expect(wire.message).toBe(expected[locale])
      expect(wire.fallbackMessage).toBe(expected['en-US'])
      expect(wire.messageKey).toBe('admin.settings.rateLimit.error.windowMin')
      // The key never substitutes for the text.
      expect(wire.message).not.toBe(wire.messageKey)
      expect(wire.message).not.toContain('admin.settings.')
    }
  })

  it('falls back to fallbackMessage for a descriptor whose key the catalog does not know', () => {
    const retired = {
      messageKey: 'retired.catalog.key',
      fallbackMessage: 'Retired English copy.',
    } as unknown as ErrorMessageDescriptor
    expect(descriptorMessage(retired, createServerTranslator('zh-CN'))).toBe('Retired English copy.')
  })

  it('keeps standard Zod prose as an English passthrough (documented fallback)', () => {
    const parsed = z.object({ name: z.string() }).safeParse({})
    expect(parsed.success).toBe(false)
    const wire = zodIssueToWire(parsed.error!.issues[0]!)
    expect(wire.messageKey).toBe(RAW_MESSAGE_KEY)
    expect(wire.fallbackMessage).not.toBe('')
    expect(wire.message).toBe(wire.fallbackMessage)
    expect(wire.code).toBe('invalid_type')
    expect(wire.path).toEqual(['name'])
  })

  it('merges bounds with a custom params bag, keeping only primitive wire values', () => {
    const issue = {
      code: 'custom',
      message: 'admin.settings.assets.error.s3FieldRequired',
      path: [],
      minimum: 5,
      params: {
        label: 'Bucket',
        enabled: true,
        nullable: null,
        nested: { ignored: true },
        list: ['ignored'],
      },
    } as unknown as z.core.$ZodIssue

    const wire = zodIssueToWire(issue)
    expect(wire.params).toEqual({ min: 5, label: 'Bucket', enabled: true, nullable: null })
    expect(wire.fallbackMessage).toContain('Bucket')
  })

  it('maps every issue of a multi-issue failure and omits a root path', () => {
    const parsed = z.object({ a: z.string(), b: z.number() }).safeParse({ a: 1, b: 'x' })
    expect(parsed.success).toBe(false)
    const wires = zodIssuesToWire(parsed.error!.issues)
    expect(wires.map((issue) => issue.path)).toEqual([['a'], ['b']])

    const root = z.string().safeParse(1)
    expect(root.success).toBe(false)
    expect(zodIssueToWire(root.error!.issues[0]!).path).toBeUndefined()
  })
})
