import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import type { SettingsSection } from '@/shared/config/sections'
import type { BlogSettingsBundle, SettingsBundle } from '@/shared/config/types'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { projectSectionForAdmin } from '@/server/domains/settings/services/admin-projection'
import { updateBlogSettingsSection } from '@/server/domains/settings/services/core'
import { backfillSettingsSections, hydrateBlogSettings } from '@/server/domains/settings/services/hydrate'
import { computeSecretMasks, redactSecretsFromBundle } from '@/server/domains/settings/services/masks'
import { getSupportedTimeZones } from '@/server/domains/settings/timezones'
import { adminProc } from '@/server/http/orpc-base'
import { SETTINGS_SECTIONS } from '@/shared/config/sections'
import { adminSettingsBootstrapOutputSchema } from '@/shared/contracts/admin'
import { safeBigInt } from '@/shared/utils/tools'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const update = adminProc
  .route({ method: 'POST', path: '/admin/settings/update' })
  .input(
    z.object({
      section: z.enum([...SETTINGS_SECTIONS] as [SettingsSection, ...SettingsSection[]]),
      payload: z.record(z.string(), z.unknown()),
    }),
  )
  // The response is authoritative: the merged, validated section in the admin display shape.
  // The client adopts it as its new baseline — a save must never refetch the document out
  // from under the user's hands. The REAL runtime gate lives in `projectSectionForAdmin`.
  .output(z.object({ section: z.unknown(), warnings: z.array(z.string()) }))
  .handler(async ({ input, context }) => {
    const editorId = safeBigInt(context.viewer.id)
    // DomainError translation lives in orpc-base's domainErrorGuard —
    // no per-controller catch here.
    const { bundle, warnings } = await updateBlogSettingsSection(context.db, input.section, input.payload, editorId)
    recordAuditEventFromContext(context, {
      action: 'settings_updated',
      resourceType: 'setting',
      resourceId: input.section,
      details: { section: input.section },
    })
    if (bundle === null) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: '设置保存后无法读取最新配置。' })
    }
    const masks = computeSecretMasks(bundle)
    return { section: projectSectionForAdmin(input.section, bundle, masks), warnings }
  })

// Settings layout loader data behind `/admin/settings`: hydrate → eager
// backfill → 503 semantics replicated from `layout.tsx` exactly.
const bootstrap = adminProc
  .route({ method: 'GET', path: '/admin/settings/bootstrap' })
  .output(adminSettingsBootstrapOutputSchema)
  .handler(async ({ context }) => {
    const { db } = context
    const bundle = await hydrateBlogSettings(db)
    if (bundle === null) {
      throw new ORPCError('SERVICE_UNAVAILABLE', { message: '站点尚未完成安装。' })
    }
    // Eager backfill: any section that is null but carries registry
    // defaults gets written to DB and populated in the bundle copy before
    // the missing-section check — matches the layout loader's order.
    const mutable = await backfillSettingsSections(db, bundle)
    const missing = Object.entries(mutable)
      .filter(([, value]) => value === null)
      .map(([key]) => key)
    if (missing.length > 0) {
      throw new ORPCError('SERVICE_UNAVAILABLE', {
        message:
          `设置数据不完整，缺少以下 section：${missing.join('、')}。` +
          '安装流程本应写入所有设置行，因此这通常意味着某行被手动删除。请重新运行安装流程或从备份还原。',
      })
    }
    const masks = computeSecretMasks(unsafeCast<BlogSettingsBundle>(mutable))
    const redacted = unsafeCast<SettingsBundle>(redactSecretsFromBundle(unsafeCast<BlogSettingsBundle>(mutable)))
    return { bundle: redacted, timeZones: getSupportedTimeZones(), masks }
  })

export const adminSettingsRouter = { update, bootstrap }
