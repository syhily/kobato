import type { Database } from '@/server/infra/db/database'
import type { ServerMessageId } from '@/shared/i18n/messages/server/en-US'

import { updateBlogSettingsSection } from '@/server/domains/settings/services/core'
import { findSettingByScope, upsertSetting } from '@/server/infra/db/operations/setting'
import { getLogger } from '@/server/infra/logger'
import { NOTIFICATION_SOURCES, type NotificationSource } from '@/shared/contracts/notifications'
import { isRecord } from '@/shared/utils/type-guards'

const log = getLogger('settings.zeabur-mail-cleanup')
const [ZEABUR_MAIL_CLEANUP_SOURCE] = NOTIFICATION_SOURCES

/** Durable one-shot flag: a `system.`-scoped `setting` row (hydration reads `blog.*` only). */
const BOOT_FLAG_SCOPE = 'system.zeabur-mail-cleanup'

export interface ZeaburMailCleanupNotify {
  titleKey: ServerMessageId
  bodyKey: ServerMessageId
  source?: NotificationSource
  actionUrl?: string
}

/**
 * One-shot boot cleanup for Zeabur's retired hosted mail API: a stored `blog.mail` row
 * still carrying `transport: 'zeabur'` would hydrate onto the SMTP transport and silently
 * send nothing (no SMTP host configured). Such a row is rewritten through the honest
 * section update path — mail disabled, transport pinned to SMTP, legacy keys dropped by
 * write-schema validation, the bundle refreshed and the transport cache invalidated by
 * the registered section-change handlers; the injected notifier alerts the admins when a
 * row was actually cleaned.
 *
 * Rows that merely CARRY the legacy `host`/`apiKey` keys are left untouched: every
 * pre-cleanup install seeded those keys from the old defaults, so their presence says
 * nothing about the transport in use — and hydration strips unknown keys anyway, making
 * them inert for smtp/mailgun rows.
 *
 * Flag-gated like the other boot backfills: the flag is written only after the cleanup
 * (and its notification) succeeded, so a crash retries on the next boot.
 */
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
