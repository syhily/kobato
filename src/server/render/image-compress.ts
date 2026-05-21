import type { Buffer } from 'node:buffer'

import sharp from 'sharp'

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
