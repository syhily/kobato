import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import type { SettingsSection } from '@/shared/config/sections'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { updateBlogSettingsSection } from '@/server/domains/settings/services/core'
import { adminProc } from '@/server/http/orpc-base'
import { DomainError } from '@/server/infra/http/errors'
import { SETTINGS_SECTIONS } from '@/shared/config/sections'
import { safeBigInt } from '@/shared/utils/tools'

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

export const adminSettingsRouter = { update }
