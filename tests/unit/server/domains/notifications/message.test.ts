import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NotificationRow } from '@/server/infra/db/types'
import type { AppLocale } from '@/shared/i18n/locales'

const logWarn = vi.hoisted(() => vi.fn())

vi.mock('@/server/infra/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/logger')>()
  return {
    ...actual,
    getLogger: (scope: string) => {
      const real = actual.getLogger(scope)
      return scope === 'notifications.message' ? { ...real, warn: logWarn } : real
    },
  }
})

const { __resetNotificationMessageWarningsForTests, encodeNotificationDescriptor, resolveNotificationMessage } =
  await import('@/server/domains/notifications/message')
const { createServerTranslator } = await import('@/server/infra/i18n')
const { SUPPORTED_LOCALES } = await import('@/shared/i18n/locales')

// The resolver is the single read-side seam for every notification surface
// (inbox, thread, email). These tests pin the fallback contract and the
// write-time validation; the integration suite pins the read paths.

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
  logWarn.mockReset()
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
    expect(logWarn).not.toHaveBeenCalled()
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
    // title and body share the same missing key → one warning for it.
    expect(logWarn).toHaveBeenCalledTimes(1)
    expect(logWarn.mock.calls[0]![1]).toMatchObject({ key: 'notification.removed.key', reason: 'unregistered-key' })
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
    expect(logWarn).toHaveBeenCalledTimes(2)
    for (const call of logWarn.mock.calls) {
      expect(call[1]).toMatchObject({ reason: 'invalid-params' })
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

  it('rejects HTML in params (the reader renders plain text)', () => {
    expect(() =>
      encodeNotificationDescriptor({
        ...valid,
        titleParams: { taskKey: '<script>alert(1)</script>' },
      }),
    ).toThrow(/must not contain HTML/)
  })

  it('rejects a non-finite number and non-JSON values', () => {
    expect(() => encodeNotificationDescriptor({ ...valid, titleParams: { count: Number.NaN } })).toThrow(
      /finite number/,
    )
    expect(() =>
      encodeNotificationDescriptor({ ...valid, bodyParams: { nested: { fn: (() => 1) as never } } }),
    ).toThrow(/JSON-serializable/)
  })

  it('accepts nested JSON params', () => {
    expect(() =>
      encodeNotificationDescriptor({ ...valid, bodyParams: { list: [1, 'two', true, null], nested: { ok: 1 } } }),
    ).not.toThrow()
  })
})
