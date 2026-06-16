import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { DomainError } from '@/server/infra/http/errors'
import { processImageBuffer } from '@/server/infra/image/process'

// Generate a tiny in-memory PNG so we don't need any test fixtures on
// disk. sharp can decode whatever we give it; the pipeline re-encodes
// to JPEG and reports the post-encoding dimensions.
async function syntheticPng(
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer()
}

describe('server/images/process — processImageBuffer', () => {
  it('re-encodes to JPEG and reports the matching width/height + thumbhash', async () => {
    const input = await syntheticPng(640, 480, { r: 32, g: 64, b: 128 })
    const result = await processImageBuffer({ buffer: input, jpegQuality: 80 })

    expect(result.width).toBe(640)
    expect(result.height).toBe(480)
    expect(result.byteSize).toBe(result.buffer.byteLength)
    // JPEGs always start with 0xFFD8 0xFFE0/0xFFE1.
    expect(result.buffer.subarray(0, 2).toString('hex')).toBe('ffd8')
    // Thumbhash is a base64 string between 16 and 32 chars typically.
    expect(typeof result.thumbhash).toBe('string')
    expect(result.thumbhash.length).toBeGreaterThan(8)
  })

  it('honours the jpegQuality knob (lower quality → smaller buffer for the same source)', async () => {
    const input = await syntheticPng(800, 600, { r: 200, g: 150, b: 50 })
    const high = await processImageBuffer({ buffer: input, jpegQuality: 90 })
    const low = await processImageBuffer({ buffer: input, jpegQuality: 50 })
    expect(low.byteSize).toBeLessThanOrEqual(high.byteSize)
  })

  it('throws DomainError(400) for unparseable input', async () => {
    const garbage = Buffer.from('this is not an image')
    await expect(processImageBuffer({ buffer: garbage, jpegQuality: 80 })).rejects.toBeInstanceOf(DomainError)
  })

  it('coerces the output to the requested resize dimensions (used by the music import 300×300 cover path)', async () => {
    const input = await syntheticPng(800, 600, { r: 50, g: 100, b: 150 })
    const result = await processImageBuffer({
      buffer: input,
      jpegQuality: 85,
      resize: { width: 300, height: 300, fit: 'cover' },
    })
    expect(result.width).toBe(300)
    expect(result.height).toBe(300)
  })

  it('preserves the original dimensions when no resize is requested', async () => {
    const input = await syntheticPng(800, 600, { r: 50, g: 100, b: 150 })
    const result = await processImageBuffer({ buffer: input, jpegQuality: 85 })
    expect(result.width).toBe(800)
    expect(result.height).toBe(600)
  })
})
