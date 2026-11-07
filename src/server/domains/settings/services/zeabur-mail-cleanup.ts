import type { Database } from '@/server/infra/db/database'

import { updateBlogSettingsSection } from '@/server/domains/settings/services/core'
import { findSettingByScope, upsertSetting } from '@/server/infra/db/operations/setting'
import { getLogger } from '@/server/infra/logger'
import { isRecord } from '@/shared/utils/type-guards'

const log = getLogger('settings.zeabur-mail-cleanup')

/** Durable one-shot flag: a `system.`-scoped `setting` row (hydration reads `blog.*` only). */
const BOOT_FLAG_SCOPE = 'system.zeabur-mail-cleanup'

export interface ZeaburMailCleanupNotify {
  title: string
  body: string
  source?: string
  actionUrl?: string
}

/**
 * Zeabur's hosted mail API is gone. A stored `blog.mail` row still carrying
 * the legacy `transport: 'zeabur'` (or its `host`/`apiKey` fields) would
 * hydrate onto the SMTP transport — silently sending nothing, since no SMTP
 * host is configured. This one-shot boot cleanup rewrites such a row through
 * the honest section update path: mail disabled, transport pinned to SMTP,
 * legacy keys dropped by the write-schema validation (zod strips unknown
 * keys), the in-memory bundle refreshed and the transport cache invalidated
 * by the registered section-change handlers. When a row was actually
 * cleaned, the injected notifier alerts the admins.
 *
 * Flag-gated and failure-swallowing like the other boot backfills: the flag
 * is written only after the cleanup (and its notification) succeeded, so a
 * crash retries on the next boot.
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
    if (mail !== null && (mail.transport === 'zeabur' || 'host' in mail || 'apiKey' in mail)) {
      await updateBlogSettingsSection(db, 'mail', { mail: { enabled: false, transport: 'smtp' } }, null)
      cleaned = true
      log.warn('Disabled a legacy Zeabur mail configuration; mail stays off until SMTP or Mailgun is configured')
    }
    if (cleaned) {
      await notify({
        title: '邮件服务已自动关闭',
        body: 'Zeabur 邮件服务已下线，系统检测到站点仍在使用它，已自动关闭邮件发送。请到「系统设置 → 邮件」重新配置 SMTP 或 Mailgun 后重新启用。',
        source: 'zeabur-mail-cleanup',
        actionUrl: '/admin/settings',
      })
    }
    upsertSetting(db, { completedAt: new Date().toISOString(), cleaned }, null, BOOT_FLAG_SCOPE)
  } catch (error) {
    log.warn('Zeabur mail cleanup failed; will retry on next boot', { error: String(error) })
  }
}
