import { uploadBrandingAsset } from '@kobato/server/domains/assets/management'
import { isBrandingSlot } from '@kobato/server/domains/assets/services/storage'
import { errorJsonResponse } from '@kobato/server/http/errors'
import { adminUploadRoute } from '@kobato/server/http/resources/admin-upload-route'

export const brandingRouter = adminUploadRoute({
  path: '/api/admin/branding/upload',
  maxSize: 2 * 1024 * 1024,
  tooLarge: { messageKey: 'common.error.uploadTooLarge' },
  missingFile: 'common.error.uploadMissing',
  logScope: 'branding.http',
  logMessage: 'Branding uploaded',
  validateBody(body, c) {
    const slot = body.slot
    if (typeof slot !== 'string' || !isBrandingSlot(slot)) {
      return errorJsonResponse(c, 400, 'branding.error.unknownSlot')
    }
    return { value: slot }
  },
  async handler({ c, file, validated: slot }) {
    const buffer = Buffer.from(await file.arrayBuffer())
    const ref = await uploadBrandingAsset(c.var.requestContext.db, slot, buffer)
    return {
      response: c.json({ slot, ref }),
      audit: {
        action: 'branding_uploaded',
        resourceType: 'branding',
        resourceId: slot,
        details: { size: buffer.length },
      },
      logContext: { slot, size: buffer.length },
    }
  },
})
