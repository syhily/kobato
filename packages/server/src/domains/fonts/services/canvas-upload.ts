import { FONT_DIR } from '@kobato/server/infra/data-paths'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface CanvasFontUploadResult {
  slot: 'og' | 'calendar'
  size: number
  contentType: 'font/ttf' | 'font/otf'
  destination: string
}

export async function uploadCanvasFont(file: File, slot: 'og' | 'calendar'): Promise<CanvasFontUploadResult> {
  const lower = file.name.toLowerCase()
  const contentType = lower.endsWith('.ttf') ? 'font/ttf' : lower.endsWith('.otf') ? 'font/otf' : null
  if (contentType === null) {
    throw new ActionFailure(400, descriptorFor('fonts.error.wrongFormat'))
  }
  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.length === 0) {
    throw new ActionFailure(400, descriptorFor('common.error.uploadEmpty'))
  }

  await mkdir(FONT_DIR, { recursive: true })
  const extension = contentType === 'font/otf' ? 'otf' : 'ttf'
  const destination = path.join(FONT_DIR, `${slot}.${extension}`)
  await writeFile(destination, buffer)
  return { slot, size: buffer.length, contentType, destination }
}
