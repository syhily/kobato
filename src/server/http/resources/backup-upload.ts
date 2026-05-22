import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import type { Env } from '@/server/http/context'

import { restoreFromBackup } from '@/server/domains/backup/service'
import { requireRoleMw } from '@/server/http/middlewares/hono-rbac'
import { getLogger } from '@/server/infra/logger'
import { requestShutdown } from '@/server/infra/shutdown'

const log = getLogger('backup.upload')

export const backupUploadRouter = new Hono<Env>().post(
  '/api/admin/backup/upload-restore',
  requireRoleMw('admin'),
  bodyLimit({
    maxSize: 500 * 1024 * 1024, // 500 MB
    onError: (c) => c.json({ error: { message: '上传文件过大' } }, 413),
  }),
  async (c) => {
    const body = await c.req.parseBody({ all: false })
    const file = body.file
    if (!(file instanceof File)) {
      return c.json({ error: { message: '请上传文件' } }, 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    await restoreFromBackup(buffer)

    log.info('Restore from uploaded backup completed')

    // Graceful restart after response is sent
    setTimeout(() => {
      requestShutdown('backup-restore')
    }, 500)

    return c.json({ success: true })
  },
)
