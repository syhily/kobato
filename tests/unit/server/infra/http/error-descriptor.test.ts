import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  descriptorFor,
  isUiMessageId,
  messageDescriptor,
  RAW_MESSAGE_KEY,
  rawMessageDescriptor,
  zodIssueToWire,
  zodIssuesToWire,
} from '@/server/infra/http/error-descriptor'
import { rateLimitBucketMessages } from '@/shared/config/rate-limit-bucket'
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
      code: 'too_small',
      path: ['signIn', 'windowSeconds'],
    })
  })

  it('keeps standard Zod prose as an English passthrough (documented fallback)', () => {
    const parsed = z.object({ name: z.string() }).safeParse({})
    expect(parsed.success).toBe(false)
    const wire = zodIssueToWire(parsed.error!.issues[0]!)
    expect(wire.messageKey).toBe(RAW_MESSAGE_KEY)
    expect(wire.fallbackMessage).not.toBe('')
    expect(wire.code).toBe('invalid_type')
    expect(wire.path).toEqual(['name'])
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
