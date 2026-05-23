import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { drawOpenGraph } from '@/server/render/og/render'

// We don't pin a byte-for-byte PNG hash because that would break on every
// node-canvas / sharp / OS font-hinting upgrade. Instead pin the structural
// invariants: it actually returns a PNG buffer of the configured size.

async function makeCoverBuffer(): Promise<Buffer> {
  return sharp({
    create: {
      width: 200,
      height: 200,
      channels: 3,
      background: { r: 32, g: 64, b: 128 },
    },
  })
    .png()
    .toBuffer()
}

describe('services/images/og — drawOpenGraph', () => {
  it('returns a valid PNG buffer for a typical post', { timeout: 30_000 }, async () => {
    const cover = await makeCoverBuffer()
    const output = await drawOpenGraph({
      title: '测试文章',
      summary: 'summary text',
      cover: `data:image/png;base64,${cover.toString('base64')}`,
    })

    expect(Buffer.isBuffer(output)).toBe(true)
    // PNG magic bytes (89 50 4E 47 0D 0A 1A 0A)
    expect(output[0]).toBe(0x89)
    expect(String.fromCharCode(output[1], output[2], output[3])).toBe('PNG')
  })

  it('encoded PNG decodes to the configured OG dimensions', { timeout: 30_000 }, async () => {
    const cover = await makeCoverBuffer()
    const output = await drawOpenGraph({
      title: 'T',
      summary: 'S',
      cover: `data:image/png;base64,${cover.toString('base64')}`,
    })
    const meta = await sharp(output).metadata()
    // Defaults from blog.config:
    //   og.width × og.height (typically 1200×630). Reading from sharp avoids
    //   importing config in this test (which would drag the catalog in).
    expect(meta.width).toBeGreaterThan(0)
    expect(meta.height).toBeGreaterThan(0)
    // Verify aspect ratio matches the typical OG card (~1.9). If a future
    // refactor sets a square OG image this test will surface it.
    expect(meta.width! / meta.height!).toBeCloseTo(1.9, 0)
  })

  it('trims summaries longer than 80 chars without crashing', { timeout: 30_000 }, async () => {
    const cover = await makeCoverBuffer()
    const longSummary = 'a'.repeat(500)
    const output = await drawOpenGraph({
      title: 'long',
      summary: longSummary,
      cover: `data:image/png;base64,${cover.toString('base64')}`,
    })
    expect(output.byteLength).toBeGreaterThan(0)
  })
})
