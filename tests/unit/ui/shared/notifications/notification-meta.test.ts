import { MailWarningIcon, MegaphoneIcon, MessageSquareIcon, ShieldAlertIcon, WrenchIcon } from 'lucide-react'
import { describe, expect, it } from 'vitest'

import { formatNotificationTime, notificationMeta } from '@/ui/shared/notifications/notification-meta'

describe('ui/shared/notifications/notification-meta', () => {
  it('maps the Zeabur mail-cleanup source to the 系统提醒 chrome', () => {
    const meta = notificationMeta({ kind: 'admin', source: 'zeabur-mail-cleanup' })
    expect(meta.kindLabel).toBe('系统提醒')
    expect(meta.icon).toBe(MailWarningIcon)
  })

  it('maps the job-run source to the 任务提醒 chrome', () => {
    const meta = notificationMeta({ kind: 'admin', source: 'job-run' })
    expect(meta.kindLabel).toBe('任务提醒')
    expect(meta.icon).toBe(WrenchIcon)
  })

  it('lets a known source override the kind chrome', () => {
    expect(notificationMeta({ kind: 'direct', source: 'job-run' })).toEqual({
      icon: WrenchIcon,
      kindLabel: '任务提醒',
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
      expect(meta.kindLabel, `${kind}/${String(source)}`).toBe(label)
      expect(meta.icon, `${kind}/${String(source)}`).toBe(icon)
    }
  })

  it('formats a timestamp as a relative zh-CN string against the given now', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')

    expect(formatNotificationTime('2026-01-01T00:03:00.000Z', now)).toBe('3 分钟内')
    expect(formatNotificationTime('2025-12-31T23:00:00.000Z', now)).toBe('大约 1 小时前')
    // The number overload accepts `Date.now()`-style milliseconds.
    expect(formatNotificationTime('2026-01-01T00:03:00.000Z', now.getTime())).toBe('3 分钟内')
  })
})
