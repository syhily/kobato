import { uploadFont, FONT_MAX_BYTES } from '@/server/domains/fonts/services/upload'
import { adminUploadRoute } from '@/server/http/resources/admin-upload-route'
import { formatBytes } from '@/shared/utils/formatter'

/**
 * Font *package* upload as a native Hono route: 60 MiB sources exceed the
 * oRPC bridge's body limit (mounted before `createApiApp` for its own
 * bodyLimit). The sync slice runs in-request; the row inserts on success.
 */
export const fontsPackageRouter = adminUploadRoute({
  path: '/api/admin/fonts/package/upload',
  maxSize: FONT_MAX_BYTES,
  tooLargeMessage: `上传文件过大（上限 ${formatBytes(FONT_MAX_BYTES)}）`,
  missingFileMessage: '请上传字体文件',
  logScope: 'fonts.package.http',
  logMessage: 'Font package uploaded',
  validateBody(body, c) {
    const familyName = body.familyName
    if (typeof familyName !== 'string' || familyName.trim() === '') {
      return c.json({ error: { message: '字体名称不能为空' } }, 400)
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
