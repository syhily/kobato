import type { Buffer } from 'node:buffer'

import sharp from 'sharp'

// Statically imported and bundled; under SEA the bundler plugin redirects
// sharp's own platform loads to `nativeRequire` (see
// `scripts/sea/redirect-native-requires.ts`).

export interface CompressImageOptions {
  preserveAlpha?: boolean
}

/** Pixel width of an encoded image, or `undefined` when the buffer is not
 *  a decodable image at all. The avatar pipeline uses this to spot mirror
 *  placeholders served inline at the wrong size. */
export async function imageWidth(buf: Buffer): Promise<number | undefined> {
  try {
    const meta = await sharp(buf).metadata()
    return meta.width
  } catch {
    return undefined
  }
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
