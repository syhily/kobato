import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import type { SettingsSection } from '@/shared/config/sections'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import {
  computeSecretMasks,
  projectSectionForAdmin,
  updateBlogSettingsSection,
} from '@/server/domains/settings/services/core'
import { adminProc } from '@/server/http/orpc-base'
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
  // The response is authoritative: the merged, validated section in the
  // admin display shape (masks merged in for assets/mail/search). The
  // client adopts it as its new baseline instead of revalidating the
  // loader — a save must never refetch the document out from under the
  // user's hands. The oRPC output schema is necessarily loose (the shape
  // is per-section); the REAL runtime gate lives in
  // `projectSectionForAdmin`, which validates against the per-section
  // schema at assembly time.
  .output(z.object({ section: z.unknown() }))
  .handler(async ({ input, context }) => {
    const editorId = safeBigInt(context.viewer.userId)
    // DomainError translation lives in orpc-base's domainErrorGuard —
    // no per-controller catch here.
    const bundle = await updateBlogSettingsSection(context.db, context.pool, input.section, input.payload, editorId)
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
    return { section: projectSectionForAdmin(input.section, bundle, masks) }
  })

export const adminSettingsRouter = { update }
