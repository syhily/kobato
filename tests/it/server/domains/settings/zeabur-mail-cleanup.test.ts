import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { runZeaburMailCleanupAtBoot } from '@/server/domains/settings/services/zeabur-mail-cleanup'
import { findSettingByScope } from '@/server/infra/db/operations/setting'
import { setting } from '@/server/infra/db/schema/config'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

function readMailRow(): Record<string, unknown> | null {
  const row = findSettingByScope(db, 'blog.mail')
  if (row === null) {
    return null
  }
  const data = row.data as Record<string, unknown>
  return data.mail as Record<string, unknown>
}

describe('zeabur mail cleanup', () => {
  it('disables a legacy zeabur row, drops its legacy keys, and notifies once', async () => {
    await db.insert(setting).values({
      scope: 'blog.mail',
      data: {
        mail: {
          enabled: true,
          sender: 'noreply@example.com',
          transport: 'zeabur',
          host: 'api.zeabur.com',
          apiKey: 'ZS-SECRET',
        },
      },
    })
    const notify = vi.fn()

    await runZeaburMailCleanupAtBoot(db, notify)

    const mail = readMailRow()
    expect(mail).toMatchObject({ enabled: false, transport: 'smtp' })
    expect(mail).not.toHaveProperty('host')
    expect(mail).not.toHaveProperty('apiKey')
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0]![0]).toMatchObject({ source: 'zeabur-mail-cleanup', actionUrl: '/admin/settings' })
    expect(findSettingByScope(db, 'system.zeabur-mail-cleanup')).not.toBeNull()

    // Flagged: a second boot is a no-op, even for the notification.
    await runZeaburMailCleanupAtBoot(db, notify)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('cleans rows that only carry the legacy keys without the zeabur transport', async () => {
    await db.insert(setting).values({
      scope: 'blog.mail',
      data: { mail: { enabled: true, transport: 'smtp', smtpHost: 'smtp.example.com', apiKey: 'leftover' } },
    })
    const notify = vi.fn()

    await runZeaburMailCleanupAtBoot(db, notify)

    const mail = readMailRow()
    expect(mail).toMatchObject({ enabled: false, transport: 'smtp', smtpHost: 'smtp.example.com' })
    expect(mail).not.toHaveProperty('apiKey')
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('leaves a modern row untouched and only writes the flag', async () => {
    await db.insert(setting).values({
      scope: 'blog.mail',
      data: { mail: { enabled: true, transport: 'mailgun', mailgunDomain: 'mail.test', mailgunApiKey: 'key' } },
    })
    const notify = vi.fn()

    await runZeaburMailCleanupAtBoot(db, notify)

    expect(readMailRow()).toMatchObject({ enabled: true, transport: 'mailgun', mailgunDomain: 'mail.test' })
    expect(notify).not.toHaveBeenCalled()
    expect(findSettingByScope(db, 'system.zeabur-mail-cleanup')).not.toBeNull()
  })

  it('writes the flag without touching anything when no mail row exists', async () => {
    const notify = vi.fn()

    await runZeaburMailCleanupAtBoot(db, notify)

    expect(readMailRow()).toBeNull()
    expect(notify).not.toHaveBeenCalled()
    expect(findSettingByScope(db, 'system.zeabur-mail-cleanup')).not.toBeNull()
  })
})
