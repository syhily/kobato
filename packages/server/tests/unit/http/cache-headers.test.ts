import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Cache-Control headers on derived assets (OG images, sitemaps) are part of
// the public surface — search engines, social previewers, and CDNs key on
// them. This file pins the live policy so any tweak shows up as a diff.
function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('contract: cache-control on derived assets', () => {
  it('og image responses keep a short revalidation window (URL is content-stable, not immutable)', () => {
    const source = read('packages/server/src/http/resources/images.ts')
    expect(source).toContain("'Cache-Control': 'public, max-age=3600'")
    expect(source).not.toContain('604800, immutable')
  })

  it('sitemap.xml stays cacheable for 1 hour', () => {
    const source = read('packages/server/src/http/resources/sitemap.ts')
    expect(source).toContain("'public, max-age=3600'")
  })

  it('avatar route emits a cache-control header (not a cache-busting default)', () => {
    const source = read('packages/server/src/http/resources/images.ts')
    expect(source).toContain('Cache-Control')
  })
})
