import { adminBrandingContract } from '@kobato/api/rpc/admin/branding'
import { clearBrandingAsset, uploadBrandingAsset } from '@kobato/server/domains/assets/management'
import { isBrandingSlot } from '@kobato/server/domains/assets/services/storage'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { implementAdmin } from '@kobato/server/http/orpc-base'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'

const log = getLogger('branding.controller')

const impl = implementAdmin(adminBrandingContract)

const clear = impl.clear.handler(async ({ input, context }) => {
  const slot = input.slot
  if (!isBrandingSlot(slot)) {
    throw new ActionFailure(400, descriptorFor('branding.error.unknownSlot'))
  }
  await clearBrandingAsset(context.db, slot)
  recordAuditEventFromContext(context, {
    action: 'branding_cleared',
    resourceType: 'branding',
    resourceId: slot,
  })
  log.info('Branding cleared', { slot })
  return { slot, success: true }
})

const upload = impl.upload.handler(async ({ input, context }) => {
  const slot = input.slot
  if (!isBrandingSlot(slot)) {
    throw new ActionFailure(400, descriptorFor('branding.error.unknownSlot'))
  }
  const buffer = Buffer.from(await input.file.arrayBuffer())
  const ref = await uploadBrandingAsset(context.db, slot, buffer)
  recordAuditEventFromContext(context, {
    action: 'branding_uploaded',
    resourceType: 'branding',
    resourceId: slot,
    details: { size: buffer.length },
  })
  log.info('Branding uploaded', { slot, size: buffer.length })
  return { slot, ref }
})

export const adminBrandingRouter = impl.router({ clear, upload })
