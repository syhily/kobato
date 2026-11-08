import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { errorJsonResponse } from '@/server/http/errors'
import { adminUploadRoute } from '@/server/http/resources/admin-upload-route'
import { FONT_DIR } from '@/server/infra/paths'
import { resetCanvasFont, resetFontCache } from '@/server/render/canvas-fonts'

const FONT_SLOTS = new Set(['og', 'calendar'])
const FONT_MAX_BYTES = 60 * 1024 * 1024

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

export const fontsRouter = adminUploadRoute({
  path: '/api/admin/fonts/upload',
  maxSize: FONT_MAX_BYTES,
  tooLarge: { messageKey: 'common.error.uploadTooLarge' },
  missingFile: 'common.error.uploadMissing',
  logScope: 'fonts.http',
  logMessage: 'Font uploaded',
  validateBody(body, c) {
    const slot = body.slot
    if (!isFontSlot(slot)) {
      return errorJsonResponse(c, 400, 'fonts.error.unknownSlot')
    }
    return { value: slot }
  },
  async handler({ c, file, validated: slot }) {
    const contentType = fontContentType(file.name)
    if (!contentType) {
      return errorJsonResponse(c, 400, 'fonts.error.wrongFormat')
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.length === 0) {
      return errorJsonResponse(c, 400, 'common.error.uploadEmpty')
    }

    await mkdir(FONT_DIR, { recursive: true })
    const ext = file.name.toLowerCase().endsWith('.otf') ? 'otf' : 'ttf'
    const dest = path.join(FONT_DIR, `${slot}.${ext}`)
    await writeFile(dest, buffer)
    resetFontCache()
    // Drop the registered slot state too, or the single-flight cache keeps serving the old font.
    resetCanvasFont(slot)

    return {
      response: c.json({ slot, size: buffer.length }),
      audit: {
        action: 'font_uploaded',
        resourceType: 'font',
        resourceId: slot,
        details: { size: buffer.length, contentType },
      },
      logContext: { slot, size: buffer.length, dest },
    }
  },
})
