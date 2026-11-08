import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
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
    // Dimensions come from the seo.og settings section (typically 1200×630).
    // Reading from sharp avoids importing config in this test (which would
    // drag the catalog in).
    expect(meta.width).toBeGreaterThan(0)
    expect(meta.height).toBeGreaterThan(0)
    // Verify aspect ratio matches the typical OG card (~1.9). If a future
    // refactor sets a square OG image this test will surface it.
    expect(meta.width! / meta.height!).toBeCloseTo(1.9, 0)
  })

  it(
    'fetches a remote cover through the guarded fetch, never loadImage’s own HTTP path',
    { timeout: 30_000 },
    async () => {
      const cover = await makeCoverBuffer()
      const fetchMock = vi.fn(
        async (_input: RequestInfo | URL) =>
          new Response(new Uint8Array(cover), { status: 200, headers: { 'content-type': 'image/png' } }),
      )
      vi.stubGlobal('fetch', fetchMock)
      try {
        const output = await drawOpenGraph({
          title: 'remote cover',
          summary: 'summary',
          cover: 'https://cdn.example.com/cover.png',
        })
        expect(Buffer.isBuffer(output)).toBe(true)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock.mock.calls[0]?.[0]).toBe('https://cdn.example.com/cover.png')
      } finally {
        vi.unstubAllGlobals()
      }
    },
  )

  it('refuses a cover that is neither a site-owned path nor http(s)', { timeout: 30_000 }, async () => {
    // A raw string must never reach `loadImage`: it treats existing paths as
    // local files (file read) and everything else as an unbounded HTTP GET.
    await expect(drawOpenGraph({ title: 't', summary: 's', cover: 'file:///etc/passwd' })).rejects.toThrow(
      /OG cover is not/,
    )
  })

  it('renders from the pinned settings snapshot (title + SEO dimensions)', { timeout: 30_000 }, async () => {
    const cover = await makeCoverBuffer()
    const coverRef = `data:image/png;base64,${cover.toString('base64')}`
    const bundled = (title: string, width: number, height: number): BlogSettingsBundle => ({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, title },
      seo: { ...TEST_BLOG_SETTINGS_BUNDLE.seo!, og: { width, height } },
    })

    const alpha = await drawOpenGraph(
      { title: 'Card', summary: 'summary', cover: coverRef },
      bundled('Alpha Site', 1200, 630),
    )
    const zulu = await drawOpenGraph(
      { title: 'Card', summary: 'summary', cover: coverRef },
      bundled('Zulu Site', 1200, 630),
    )

    // Same card inputs, different pinned site identity → different bytes.
    expect(alpha.equals(zulu)).toBe(false)

    // The pinned seo.og dimensions drive the canvas, not the global snapshot.
    const square = await drawOpenGraph(
      { title: 'Card', summary: 'summary', cover: coverRef },
      bundled('Alpha Site', 1200, 1200),
    )
    const meta = await sharp(square).metadata()
    expect(meta.width).toBe(1200)
    expect(meta.height).toBe(1200)
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
