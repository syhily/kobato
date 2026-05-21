import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/service'
import { SECTION_REGISTRY } from '@/server/domains/settings/sections'
import { getAdminBlogSettings, updateBlogSettingsSection } from '@/server/domains/settings/service'
import { getSupportedTimeZones } from '@/server/domains/settings/timezones'
import { adminProc } from '@/server/http/orpc-base'
import { ErrorMessages } from '@/server/infra/http/errors'
import { SETTINGS_SECTIONS, type SettingsSection } from '@/shared/config/settings'
import { blogSettingsBundleDto } from '@/shared/contracts/settings'

function safeBigInt(value: string): bigint | null {
  try {
    return BigInt(value)
  } catch {
    return null
  }
}

const get = adminProc
  .route({ method: 'GET', path: '/admin/settings/get' })
  .output(z.object({ bundle: blogSettingsBundleDto.nullable() }))
  .handler(() => getAdminBlogSettings())

const loadAll = adminProc
  .route({ method: 'GET', path: '/admin/settings/loadAll' })
  .output(
    z.object({
      bundle: blogSettingsBundleDto.nullable(),
      timeZones: z.array(z.string()),
    }),
  )
  .handler(async () => {
    const { bundle } = await getAdminBlogSettings()
    return { bundle, timeZones: [...getSupportedTimeZones()] }
  })

const update = adminProc
  .route({ method: 'POST', path: '/admin/settings/update' })
  .input(
    z.object({
      section: z.enum([...SETTINGS_SECTIONS] as [SettingsSection, ...SettingsSection[]]),
      payload: z.record(z.string(), z.unknown()),
    }),
  )
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    const editorId = safeBigInt(context.viewer.userId)
    const meta = SECTION_REGISTRY[input.section]
    const parsed = await meta.schema.safeParseAsync(input.payload)
    if (!parsed.success) {
      throw new ORPCError('BAD_REQUEST', {
        message: ErrorMessages.INVALID_INPUT,
        data: parsed.error.issues.map((i) => ({ message: i.message, path: i.path.map(String) })),
      })
    }
    await updateBlogSettingsSection(input.section, input.payload, editorId)
    recordAuditEventFromContext(context, {
      action: 'settings_updated',
      resourceType: 'setting',
      resourceId: input.section,
      details: { section: input.section },
    })
    return { success: true }
  })

export const adminSettingsRouter = { get, loadAll, update }
