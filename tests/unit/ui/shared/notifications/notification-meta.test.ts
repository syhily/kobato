import { MailWarningIcon, MegaphoneIcon, MessageSquareIcon, ShieldAlertIcon, WrenchIcon } from 'lucide-react'
import { describe, expect, it } from 'vitest'

import { makeTranslator } from '#/_helpers/i18n'
import { formatNotificationTime, notificationMeta } from '@/ui/shared/notifications/notification-meta'

const tZhCN = makeTranslator('zh-CN')
const tEnUS = makeTranslator('en-US')

const TIME_ZONE = 'Asia/Shanghai'

describe('ui/shared/notifications/notification-meta', () => {
  it('maps the Zeabur mail-cleanup source to the system-alert chrome', () => {
    const meta = notificationMeta({ kind: 'admin', source: 'zeabur-mail-cleanup' })
    expect(tZhCN(meta.kindLabelId)).toBe('系统提醒')
    expect(tEnUS(meta.kindLabelId)).toBe('System alert')
    expect(meta.icon).toBe(MailWarningIcon)
  })

  it('maps the job-run source to the task-alert chrome', () => {
    const meta = notificationMeta({ kind: 'admin', source: 'job-run' })
    expect(tZhCN(meta.kindLabelId)).toBe('任务提醒')
    expect(meta.icon).toBe(WrenchIcon)
  })

  it('lets a known source override the kind chrome', () => {
    expect(notificationMeta({ kind: 'direct', source: 'job-run' })).toEqual({
      icon: WrenchIcon,
      kindLabelId: 'notifications.kind.job',
    })
  })

  it('falls through to the kind mapping for an unknown or missing source', () => {
    const cases = [
      { kind: 'direct', source: 'legacy-unknown', label: '私信', icon: MessageSquareIcon },
      { kind: 'admin', source: null, label: '管理员消息', icon: ShieldAlertIcon },
      { kind: 'broadcast', source: 'some-other-producer', label: '公告', icon: MegaphoneIcon },
    ] as const

    for (const { kind, source, label, icon } of cases) {
      const meta = notificationMeta({ kind, source })
      expect(tZhCN(meta.kindLabelId), `${kind}/${String(source)}`).toBe(label)
      expect(meta.icon, `${kind}/${String(source)}`).toBe(icon)
    }
  })

  it('formats a timestamp as a relative zh-CN string against the given now', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')

    expect(formatNotificationTime('2025-12-31T23:57:00.000Z', { locale: 'zh-CN', timeZone: TIME_ZONE, now })).toBe(
      '3分钟前',
    )
    expect(formatNotificationTime('2025-12-31T23:00:00.000Z', { locale: 'zh-CN', timeZone: TIME_ZONE, now })).toBe(
      '今天',
    )
    // The number overload accepts `Date.now()`-style milliseconds.
    expect(
      formatNotificationTime('2025-12-31T23:57:00.000Z', {
        locale: 'zh-CN',
        timeZone: TIME_ZONE,
        now: now.getTime(),
      }),
    ).toBe('3分钟前')
  })

  it('formats the same instant in en-US', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    expect(formatNotificationTime('2025-12-31T23:57:00.000Z', { locale: 'en-US', timeZone: TIME_ZONE, now })).toBe(
      '3 minutes ago',
    )
  })
})
