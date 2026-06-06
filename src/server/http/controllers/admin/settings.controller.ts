import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import type { SettingsSection } from '@/shared/config/sections'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import {
  getAdminBlogSettings,
  redactSecretsFromBundle,
  updateBlogSettingsSection,
} from '@/server/domains/settings/services/core'
import { getSupportedTimeZones } from '@/server/domains/settings/timezones'
import { adminProc } from '@/server/http/orpc-base'
import { DomainError } from '@/server/infra/http/errors'
import { SETTINGS_SECTIONS } from '@/shared/config/sections'
import { blogSettingsBundleDto } from '@/shared/contracts/settings'
import { safeBigInt } from '@/shared/utils/tools'

const get = adminProc
  .route({ method: 'GET', path: '/admin/settings/get' })
  .output(z.object({ bundle: blogSettingsBundleDto.nullable() }))
  .handler(async ({ context }) => {
    const { bundle } = await getAdminBlogSettings(context.db)
    return { bundle: bundle ? redactSecretsFromBundle(bundle) : null }
  })

const loadAll = adminProc
  .route({ method: 'GET', path: '/admin/settings/loadAll' })
  .output(
    z.object({
      bundle: blogSettingsBundleDto.nullable(),
      timeZones: z.array(z.string()),
    }),
  )
  .handler(async ({ context }) => {
    const { bundle } = await getAdminBlogSettings(context.db)
    return { bundle: bundle ? redactSecretsFromBundle(bundle) : null, timeZones: [...getSupportedTimeZones()] }
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
    try {
      await updateBlogSettingsSection(context.db, context.pool, input.section, input.payload, editorId)
    } catch (err) {
      if (err instanceof DomainError && err.code === 'BAD_REQUEST') {
        throw new ORPCError('BAD_REQUEST', {
          message: err.message,
          data: err.issues,
        })
      }
      throw err
    }
    recordAuditEventFromContext(context, {
      action: 'settings_updated',
      resourceType: 'setting',
      resourceId: input.section,
      details: { section: input.section },
    })
    return { success: true }
  })

export const adminSettingsRouter = { get, loadAll, update }
