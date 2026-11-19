import { uploadFont, FONT_MAX_BYTES } from '@kobato/server/domains/fonts/services/upload.ts'
import { errorJsonResponse } from '@kobato/server/http/errors.ts'
import { adminUploadRoute } from '@kobato/server/http/resources/admin-upload-route.ts'
import { resolveAppLocalization } from '@kobato/settings/app-localization.ts'
import { formatBytes } from '@kobato/utils/format.ts'

/**
 * Font *package* upload as a native Hono route: 60 MiB sources exceed the
 * oRPC bridge's body limit (mounted before `createApiApp` for its own
 * bodyLimit). The sync slice runs in-request; the row inserts on success.
 */
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
