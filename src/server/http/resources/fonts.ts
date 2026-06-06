import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { Env } from '@/server/http/context'

import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { requireRoleMw } from '@/server/http/middlewares/hono-rbac'
import { getLogger } from '@/server/infra/logger'
import { FONT_DIR } from '@/server/infra/paths'
import { resetFontCache } from '@/server/render/og/assets'

const log = getLogger('fonts.http')

const FONT_SLOTS = new Set(['og', 'calendar'])
const FONT_MAX_BYTES = 60 * 1024 * 1024 // 60 MiB

function isFontSlot(value: unknown): value is 'og' | 'calendar' {
  return typeof value === 'string' && FONT_SLOTS.has(value)
}

function fontContentType(fileName: string): 'font/ttf' | 'font/otf' | null {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.ttf')) {
    return 'font/ttf'
  }
  if (lower.endsWith('.otf')) {
    return 'font/otf'
  }
  return null
}

export const fontsRouter = new Hono<Env>().post(
  '/api/admin/fonts/upload',
  requireRoleMw('admin'),
  bodyLimit({
    maxSize: FONT_MAX_BYTES,
    onError: (c) => c.json({ error: { message: '上传文件过大' } }, 413),
  }),
  async (c) => {
    const body = await c.req.parseBody({ all: false })
    const slot = body.slot
    const file = body.file
    if (!isFontSlot(slot)) {
      return c.json({ error: { message: '未知的字体槽位' } }, 400)
    }
    if (!(file instanceof File)) {
      return c.json({ error: { message: '请上传文件' } }, 400)
    }

    const contentType = fontContentType(file.name)
    if (!contentType) {
      return c.json({ error: { message: '仅支持 .ttf 或 .otf 字体文件' } }, 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.length === 0) {
      return c.json({ error: { message: '上传文件为空' } }, 400)
    }

    await mkdir(FONT_DIR, { recursive: true })
    const ext = file.name.toLowerCase().endsWith('.otf') ? 'otf' : 'ttf'
    const dest = path.join(FONT_DIR, `${slot}.${ext}`)
    await writeFile(dest, buffer)
    resetFontCache()

    recordAuditEvent({
      action: 'font_uploaded',
      actorId: c.var.viewer?.userId,
      actorRole: c.var.viewer?.role ?? null,
      resourceType: 'font',
      resourceId: slot,
      ipAddress: c.var.clientAddress,
      userAgent: c.req.header('User-Agent') ?? null,
      details: { size: buffer.length, contentType },
    })
    log.info('Font uploaded', { slot, size: buffer.length, dest })
    return c.json({ slot, size: buffer.length })
  },
)
