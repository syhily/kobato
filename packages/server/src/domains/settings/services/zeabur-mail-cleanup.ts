import type { Database } from '@kobato/db/sqlite/database'
import type { ServerMessageId } from '@kobato/i18n/messages/server/en-US'

import { NOTIFICATION_SOURCES, type NotificationSource } from '@kobato/api/contracts/notifications'
import { findSettingByScope, upsertSetting } from '@kobato/db/sqlite/operations/system/setting'
import { updateBlogSettingsSection } from '@kobato/server/domains/settings/services/core'
import { getLogger } from '@kobato/server/infra/logger'
import { isRecord } from '@kobato/utils/type-guards'

const log = getLogger('settings.zeabur-mail-cleanup')
const [ZEABUR_MAIL_CLEANUP_SOURCE] = NOTIFICATION_SOURCES

const BOOT_FLAG_SCOPE = 'system.zeabur-mail-cleanup'

export interface ZeaburMailCleanupNotify {
  titleKey: ServerMessageId
  bodyKey: ServerMessageId
  source?: NotificationSource
  actionUrl?: string
}

export async function runZeaburMailCleanupAtBoot(
  db: Database,
  notify: (message: ZeaburMailCleanupNotify) => Promise<void> | void,
): Promise<void> {
  try {
    if (findSettingByScope(db, BOOT_FLAG_SCOPE) !== null) {
      return
    }
    let cleaned = false
    const stored = findSettingByScope(db, 'blog.mail')
    const data: unknown = stored?.data
    const mail = isRecord(data) && isRecord(data.mail) ? data.mail : null
    if (mail?.transport === 'zeabur') {
      await updateBlogSettingsSection(db, 'mail', { mail: { enabled: false, transport: 'smtp' } }, null)
      cleaned = true
      log.warn('Disabled a legacy Zeabur mail configuration; mail stays off until SMTP or Mailgun is configured')
    }
    if (cleaned) {
      await notify({
        titleKey: 'notification.mail.zeaburCleanup.title',
        bodyKey: 'notification.mail.zeaburCleanup.body',
        source: ZEABUR_MAIL_CLEANUP_SOURCE,
        actionUrl: '/admin/settings',
      })
    }
    upsertSetting(db, { completedAt: new Date().toISOString(), cleaned }, null, BOOT_FLAG_SCOPE)
  } catch (error) {
    log.warn('Zeabur mail cleanup failed; will retry on next boot', { error: String(error) })
  }
}
