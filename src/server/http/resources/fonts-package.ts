import { uploadFont, FONT_MAX_BYTES } from '@/server/domains/fonts/services/upload'
import { errorJsonResponse } from '@/server/http/errors'
import { adminUploadRoute } from '@/server/http/resources/admin-upload-route'
import { resolveAppLocalization } from '@/shared/i18n/app-localization'
import { formatBytes } from '@/shared/i18n/format'

/**
 * Font *package* upload as a native Hono route: 60 MiB sources exceed the
 * oRPC bridge's body limit (mounted before `createApiApp` for its own
 * bodyLimit). The sync slice runs in-request; the row inserts on success.
 */
export const fontsPackageRouter = adminUploadRoute({
  path: '/api/admin/fonts/package/upload',
  maxSize: FONT_MAX_BYTES,
  // Params resolve per request: the size label follows the settings locale, and
  // the route's bodyLimit rejection happens before any handler runs.
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
