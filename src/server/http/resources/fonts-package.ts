import { uploadFont, FONT_MAX_BYTES } from '@/server/domains/fonts/services/upload'
import { adminUploadRoute } from '@/server/http/resources/admin-upload-route'
import { formatBytes } from '@/shared/utils/formatter'

/**
 * Font *package* upload (self-hosted browser web fonts). Kept as a native
 * Hono resource route rather than an oRPC procedure because source fonts can
 * be 60 MiB and the oRPC bridge sits behind the request-wide body limit
 * (default 10 MB). Mounting this route before `createApiApp()` (see
 * `middleware-pipeline.ts`) gives it its own `bodyLimit`, exactly like the
 * legacy canvas-font upload at `resources/fonts.ts`.
 *
 * The synchronous slice (~15–20s for a CJK font) happens inside the request
 * lifetime; the client shows a spinner and the row is only inserted on
 * success, so there is no `processing`/`failed` state.
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
