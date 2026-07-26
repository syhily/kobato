import { clearBrandingAsset, isBrandingSlot, uploadBrandingAsset } from '@/server/domains/assets/management'
import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { csrfGuard } from '@/server/http/middlewares/csrf'
import { requireRoleMw } from '@/server/http/middlewares/hono-rbac'
import { adminUploadRoute } from '@/server/http/resources/admin-upload-route'
import { getLogger } from '@/server/infra/logger'
import { isRecord } from '@/shared/utils/type-guards'

const log = getLogger('branding.http')

// Both endpoints live under `/api/admin/branding/*` and require the
// admin role. Binaries can be ~600 KB and SVGs ~200 KB, so a 2 MiB
// ceiling covers every slot with margin.
export const brandingRouter = adminUploadRoute({
  path: '/api/admin/branding/upload',
  maxSize: 2 * 1024 * 1024,
  tooLargeMessage: '上传文件过大',
  missingFileMessage: '请上传文件',
  logScope: 'branding.http',
  logMessage: 'Branding uploaded',
  validateBody(body, c) {
    const slot = body.slot
    if (typeof slot !== 'string' || !isBrandingSlot(slot)) {
      return c.json({ error: { message: '未知的品牌素材槽位' } }, 400)
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
}).post('/api/admin/branding/clear', requireRoleMw('admin'), csrfGuard, async (c) => {
  const parsed: unknown = await c.req.json().catch(() => null)
  const body = isRecord(parsed) ? parsed : null
  const slot = body?.slot
  if (typeof slot !== 'string' || !isBrandingSlot(slot)) {
    return c.json({ error: { message: '未知的品牌素材槽位' } }, 400)
  }
  await clearBrandingAsset(c.var.requestContext.db, slot)
  recordAuditEventFromContext(c.var.requestContext, {
    action: 'branding_cleared',
    resourceType: 'branding',
    resourceId: slot,
  })
  log.info('Branding cleared', { slot })
  return c.json({ slot, success: true })
})
