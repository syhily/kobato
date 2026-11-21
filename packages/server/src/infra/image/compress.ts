import type { Buffer } from 'node:buffer'

import sharp from 'sharp'

export interface CompressImageOptions {
  preserveAlpha?: boolean
}

const MAX_INPUT_PIXELS = 50_000_000

export async function imageWidth(buf: Buffer): Promise<number | undefined> {
  try {
    const meta = await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()
    return meta.width
  } catch {
    return undefined
  }
}

export async function compressImage(buf: Buffer, options: CompressImageOptions = {}): Promise<Buffer> {
  const pipeline = sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS })
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
