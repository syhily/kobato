import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import type { Env } from '@/server/http/context'

import { clearBrandingAsset, isBrandingSlot, uploadBrandingAsset } from '@/server/domains/assets/management'
import { requireRoleMw } from '@/server/http/middlewares/hono-rbac'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('branding.http')

// Both endpoints live under `/api/admin/branding/*` and require the
// admin role. Binaries can be ~600 KB and SVGs ~200 KB, so a 2 MiB
// ceiling covers every slot with margin.
export const brandingRouter = new Hono<Env>()
  .post(
    '/api/admin/branding/upload',
    requireRoleMw('admin'),
    bodyLimit({
      maxSize: 2 * 1024 * 1024,
      onError: (c) => c.json({ error: { message: '上传文件过大' } }, 413),
    }),
    async (c) => {
      const body = await c.req.parseBody({ all: false })
      const slot = body.slot
      const file = body.file
      if (typeof slot !== 'string' || !isBrandingSlot(slot)) {
        return c.json({ error: { message: '未知的品牌素材槽位' } }, 400)
      }
      if (!(file instanceof File)) {
        return c.json({ error: { message: '请上传文件' } }, 400)
      }
      const buffer = Buffer.from(await file.arrayBuffer())
      const ref = await uploadBrandingAsset(slot, buffer)
      log.info('Branding uploaded', { slot, size: buffer.length })
      return c.json({ slot, ref })
    },
  )
  .post('/api/admin/branding/clear', requireRoleMw('admin'), async (c) => {
    const body = (await c.req.json().catch(() => null)) as { slot?: unknown } | null
    const slot = body?.slot
    if (typeof slot !== 'string' || !isBrandingSlot(slot)) {
      return c.json({ error: { message: '未知的品牌素材槽位' } }, 400)
    }
    await clearBrandingAsset(slot)
    log.info('Branding cleared', { slot })
    return c.json({ slot, success: true })
  })
