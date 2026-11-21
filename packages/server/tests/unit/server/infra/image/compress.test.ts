import { compressImage, imageWidth } from '@kobato/server/infra/image/compress'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

async function pngDeclaringPixels(size: number): Promise<Buffer> {
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .png()
    .toBuffer()
  const forged = Buffer.from(png)
  forged.writeUInt32BE(size, 16)
  forged.writeUInt32BE(size, 20)
  return forged
}

const OVER_CAP_PIXELS = 10_000

describe('infra/image/compress — decoded-pixel cap', () => {
  it("rejects a header sharp's default would accept but our 50 M px cap does not", async () => {
    const bomb = await pngDeclaringPixels(OVER_CAP_PIXELS)

    const meta = await sharp(bomb).metadata()
    expect(meta.width).toBe(OVER_CAP_PIXELS)

    await expect(compressImage(bomb)).rejects.toThrow(/pixel limit/)
    expect(await imageWidth(bomb)).toBeUndefined()
  })

  it('still decodes and compresses a normal image', async () => {
    const png = await sharp({ create: { width: 64, height: 32, channels: 3, background: { r: 9, g: 9, b: 9 } } })
      .png()
      .toBuffer()

    expect(await imageWidth(png)).toBe(64)
    const compressed = await compressImage(png)
    expect((await sharp(compressed).metadata()).format).toBe('png')
  })

  it('returns undefined for a buffer that is not an image at all', async () => {
    expect(await imageWidth(Buffer.from('not an image'))).toBeUndefined()
  })
})
