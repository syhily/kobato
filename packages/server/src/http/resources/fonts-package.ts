import { uploadFont, FONT_MAX_BYTES } from '@kobato/server/domains/fonts/services/upload'
import { errorJsonResponse } from '@kobato/server/http/errors'
import { adminUploadRoute } from '@kobato/server/http/resources/admin-upload-route'
import { resolveAppLocalization } from '@kobato/settings/app-localization'
import { formatBytes } from '@kobato/utils/format'

export const fontsPackageRouter = adminUploadRoute({
  path: '/api/admin/fonts/package/upload',
  maxSize: FONT_MAX_BYTES,
  tooLarge: {
    messageKey: 'fonts.error.packageTooLarge',
    params: () => ({ max: formatBytes(FONT_MAX_BYTES, { locale: resolveAppLocalization().locale }) }),
  },
  missingFile: 'fonts.error.packageMissing',
  logScope: 'fonts.package.http',
  logMessage: 'Font package uploaded',
  validateBody(body, c) {
    const familyName = body.familyName
    if (typeof familyName !== 'string' || familyName.trim() === '') {
      return errorJsonResponse(c, 400, 'fonts.error.nameRequired')
    }
    return { value: familyName }
  },
  async handler({ c, file, validated: familyName }) {
    const buffer = new Uint8Array(await file.arrayBuffer())
    const font = await uploadFont(c.var.requestContext.db, {
      buffer,
      sourceName: file.name || 'font.ttf',
      familyName,
    })

    return {
      response: c.json({ font }),
      audit: {
        action: 'font_uploaded',
        resourceType: 'font',
        resourceId: font.id,
        details: { familyName: font.familyName, hash: font.hash, size: buffer.length },
      },
      logContext: { id: font.id, familyName: font.familyName, size: buffer.length },
    }
  },
})
