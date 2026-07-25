import type { Buffer } from 'node:buffer'
import type sharpDefault from 'sharp'

import { requireExternal } from '@/server/infra/sea'

// Native module — must resolve against the extracted tree under SEA (see
// `@/server/infra/sea`). Outside SEA this resolves node_modules normally.
const sharp = requireExternal<typeof sharpDefault>('sharp')

export interface CompressImageOptions {
  preserveAlpha?: boolean
}

export async function compressImage(buf: Buffer, options: CompressImageOptions = {}): Promise<Buffer> {
  const pipeline = sharp(buf)
  if (!options.preserveAlpha) {
    pipeline.flatten({ background: { r: 255, g: 255, b: 255 } })
  }
  return pipeline
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      force: true,
      palette: true,
      quality: 75,
      progressive: true,
    })
    .toBuffer()
}
