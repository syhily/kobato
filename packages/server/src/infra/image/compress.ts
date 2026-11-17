import type { Buffer } from 'node:buffer'

import sharp from 'sharp'

// sharp is statically imported — the SEA bundler redirects its platform loads to `nativeRequire`.

export interface CompressImageOptions {
  preserveAlpha?: boolean
}

// sharp decodes the WHOLE image before anything is resized: the library default
// (~268 M px ≈ 1 GB RGBA) would let one crafted upload exhaust the main thread.
// Matches the pooled upload path's cap (infra/image/process-worker).
const MAX_INPUT_PIXELS = 50_000_000

/** Pixel width of an encoded image, or `undefined` when the buffer is not
 *  a decodable image at all. The avatar pipeline uses this to spot mirror
 *  placeholders served inline at the wrong size. */
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
