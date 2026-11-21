import type { NotificationRow } from '@kobato/db/types'
import type { AppLocale } from '@kobato/i18n/locales'

import { __clearLogCaptureForTests, __logCaptureForTests } from '@kobato/server/infra/logger'
import { beforeEach, describe, expect, it } from 'vitest'

function warnLines() {
  return __logCaptureForTests().filter((entry) => entry.level === 'warn')
}

const { __resetNotificationMessageWarningsForTests, encodeNotificationDescriptor, resolveNotificationMessage } =
  await import('@kobato/server/domains/notifications/message')
const { createServerTranslator } = await import('@kobato/server/infra/i18n')
const { SUPPORTED_LOCALES } = await import('@kobato/i18n/locales')

function row(overrides: Partial<NotificationRow>): NotificationRow {
  return {
    id: 1,
    threadId: 1,
    kind: 'admin',
    senderId: null,
    title: 'stored title',
    body: 'stored body',
    titleKey: null,
    titleParams: null,
    bodyKey: null,
    bodyParams: null,
    replyable: false,
    source: null,
    actionUrl: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    recalledAt: null,
    ...overrides,
  }
}

const JOB_TITLE_PARAMS = { taskKey: 'backup' }
const JOB_BODY_PARAMS = { taskKey: 'backup', hasError: 'yes', error: 'disk full' }

beforeEach(() => {
  __clearLogCaptureForTests()
  __resetNotificationMessageWarningsForTests()
})

describe('notification message — descriptor resolution', () => {
  it('translates both fields with the reader locale', () => {
    const message = row({
      title: 'Background task failed: backup',
      body: 'Task backup failed on its most recent run: disk full Open the Tasks page for details.',
      titleKey: 'notification.job.failed.title',
      titleParams: JSON.stringify(JOB_TITLE_PARAMS),
      bodyKey: 'notification.job.failed.body',
      bodyParams: JSON.stringify(JOB_BODY_PARAMS),
    })

    const english = resolveNotificationMessage(message, createServerTranslator('en-US'))
    const simplified = resolveNotificationMessage(message, createServerTranslator('zh-CN'))
    expect(english.title).toBe('Background task failed: backup')
    expect(english.body).toBe('Task backup failed on its most recent run: disk full Open the Tasks page for details.')
    expect(simplified.title).toBe('后台任务失败：backup')
    expect(simplified.body).toBe('任务「backup」最近一次执行失败：disk full请到「任务」页面查看详情。')
    expect(simplified.title).not.toBe(english.title)
  })

  it.each(SUPPORTED_LOCALES)('matches the translator output in %s', (locale: AppLocale) => {
    const t = createServerTranslator(locale)
    const message = row({
      titleKey: 'notification.job.failed.title',
      titleParams: JSON.stringify(JOB_TITLE_PARAMS),
      bodyKey: 'notification.job.failed.body',
      bodyParams: JSON.stringify(JOB_BODY_PARAMS),
    })

    const resolved = resolveNotificationMessage(message, t)
    expect(resolved.title).toBe(t.format('notification.job.failed.title', JOB_TITLE_PARAMS))
    expect(resolved.body).toBe(t.format('notification.job.failed.body', JOB_BODY_PARAMS))
  })

  it('returns the stored text for a legacy row without a descriptor', () => {
    const legacy = row({ title: '历史标题', body: '历史正文' })
    const resolved = resolveNotificationMessage(legacy, createServerTranslator('en-US'))
    expect(resolved).toEqual({ title: '历史标题', body: '历史正文' })
    expect(warnLines()).toHaveLength(0)
  })

  it('falls back to the stored English text and warns ONCE for an unregistered key', () => {
    const orphan = row({
      title: 'Background task failed: backup',
      body: 'Task backup failed.',
      titleKey: 'notification.removed.key',
      titleParams: JSON.stringify(JOB_TITLE_PARAMS),
      bodyKey: 'notification.removed.key',
      bodyParams: JSON.stringify(JOB_BODY_PARAMS),
    })
    const t = createServerTranslator('zh-CN')

    const first = resolveNotificationMessage(orphan, t)
    const second = resolveNotificationMessage(orphan, t)

    expect(first).toEqual({ title: 'Background task failed: backup', body: 'Task backup failed.' })
    expect(second).toEqual(first)
    const warns = warnLines()
    expect(warns).toHaveLength(1)
    expect(warns[0].ctx).toMatchObject({ key: 'notification.removed.key', reason: 'unregistered-key' })
  })

  it('falls back when the stored params are not valid JSON', () => {
    const broken = row({
      title: 'Background task failed: backup',
      body: 'Task backup failed.',
      titleKey: 'notification.job.failed.title',
      titleParams: '{not json',
      bodyKey: 'notification.job.failed.body',
      bodyParams: '"a string, not an object"',
    })

    const resolved = resolveNotificationMessage(broken, createServerTranslator('zh-CN'))

    expect(resolved).toEqual({ title: 'Background task failed: backup', body: 'Task backup failed.' })
    const warns = warnLines()
    expect(warns).toHaveLength(2)
    for (const warn of warns) {
      expect(warn.ctx).toMatchObject({ reason: 'invalid-params' })
    }
  })
})

describe('notification message — write-time validation', () => {
  const valid = {
    titleKey: 'notification.mail.zeaburCleanup.title' as const,
    bodyKey: 'notification.mail.zeaburCleanup.body' as const,
  }

  it('persists the English fallback plus JSON params', () => {
    const encoded = encodeNotificationDescriptor({
      titleKey: 'notification.job.failed.title',
      titleParams: JOB_TITLE_PARAMS,
      bodyKey: 'notification.job.failed.body',
      bodyParams: JOB_BODY_PARAMS,
    })

    expect(encoded.title).toBe('Background task failed: backup')
    expect(encoded.body).toBe('Task backup failed on its most recent run: disk full Open the Tasks page for details.')
    expect(JSON.parse(encoded.titleParams!)).toEqual(JOB_TITLE_PARAMS)
    expect(JSON.parse(encoded.bodyParams!)).toEqual(JOB_BODY_PARAMS)
    expect(encoded.title).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })

  it('stores null params when the producer passes none', () => {
    const encoded = encodeNotificationDescriptor(valid)
    expect(encoded.titleParams).toBeNull()
    expect(encoded.bodyParams).toBeNull()
  })

  it('rejects an unregistered key', () => {
    expect(() =>
      encodeNotificationDescriptor({
        titleKey: 'notification.notAKey' as never,
        bodyKey: valid.bodyKey,
      }),
    ).toThrow(/not registered/)
  })

  it('rejects a key outside the notification namespace', () => {
    expect(() =>
      encodeNotificationDescriptor({
        titleKey: 'email.common.greeting' as never,
        bodyKey: valid.bodyKey,
      }),
    ).toThrow(/notification\. namespace/)
  })

  it('accepts HTML-shaped plain text in params and persists it verbatim', () => {
    const encoded = encodeNotificationDescriptor({
      ...valid,
      titleParams: { taskKey: '<script>alert(1)</script>' },
      bodyParams: { message: "Unexpected token '<'" },
    })

    expect(encoded.title).toBe('Mail sending was turned off automatically')
    expect(JSON.parse(encoded.titleParams!)).toEqual({ taskKey: '<script>alert(1)</script>' })
    expect(JSON.parse(encoded.bodyParams!)).toEqual({ message: "Unexpected token '<'" })
  })

  it('rejects a non-finite number and non-JSON values', () => {
    expect(() => encodeNotificationDescriptor({ ...valid, titleParams: { count: Number.NaN } })).toThrow(
      /finite number/,
    )
    expect(() =>
      encodeNotificationDescriptor({ ...valid, bodyParams: { nested: { fn: (() => 1) as never } } }),
    ).toThrow(/JSON-serializable/)
    expect(() => encodeNotificationDescriptor({ ...valid, bodyParams: { missing: undefined as never } })).toThrow(
      /JSON-serializable/,
    )
  })

  it('rejects class instances and circular structures', () => {
    expect(() => encodeNotificationDescriptor({ ...valid, titleParams: { when: new Date(0) as never } })).toThrow(
      /plain JSON object/,
    )

    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => encodeNotificationDescriptor({ ...valid, titleParams: circular as never })).toThrow(
      /circular reference/,
    )
  })

  it('accepts nested JSON params and shared (non-circular) references', () => {
    const shared = { ok: 1 }
    expect(() =>
      encodeNotificationDescriptor({ ...valid, bodyParams: { list: [1, 'two', true, null], a: shared, b: shared } }),
    ).not.toThrow()
  })
})

describe('notification message — HTML-shaped params render as plain text', () => {
  const SCRIPT = '<script>alert(1)</script>'
  const SYNTAX_ERROR = "Unexpected token '<'"

  function encodedRow(): NotificationRow {
    const descriptor = encodeNotificationDescriptor({
      titleKey: 'notification.job.failed.title',
      titleParams: { taskKey: SCRIPT },
      bodyKey: 'notification.job.failed.body',
      bodyParams: { taskKey: 'backup', hasError: 'yes', error: SYNTAX_ERROR },
    })
    return row({
      title: descriptor.title,
      body: descriptor.body,
      titleKey: descriptor.titleKey,
      titleParams: descriptor.titleParams,
      bodyKey: descriptor.bodyKey,
      bodyParams: descriptor.bodyParams,
    })
  }

  it.each(SUPPORTED_LOCALES)('round-trips the literal text through the reader resolver in %s', (locale: AppLocale) => {
    const stored = encodedRow()
    const resolved = resolveNotificationMessage(stored, createServerTranslator(locale))

    expect(resolved.title).toContain(SCRIPT)
    expect(resolved.body).toContain(SYNTAX_ERROR)
    expect(resolved.body.slice(0, 200)).toBe(resolved.body)
    expect(resolved.body).not.toContain('&lt;')
  })

  it('keeps the stored English fallback besides the descriptor', () => {
    const stored = encodedRow()
    expect(stored.title).toBe(`Background task failed: ${SCRIPT}`)
    expect(stored.body).toContain(SYNTAX_ERROR)
  })
})
