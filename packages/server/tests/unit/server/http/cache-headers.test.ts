import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('contract: cache-control on derived assets', () => {
  it('og image answers keep a short revalidation window (URL is content-stable, not immutable)', () => {
    const source = read('packages/server/src/http/controllers/public/image.controller.ts')
    expect(source).toContain("OG_CACHE_CONTROL = 'public, max-age=3600'")
    expect(source).not.toContain('604800, immutable')
  })

  it('sitemap.xml is revalidated, not max-age: a domain change must not be shadowed', () => {
    const source = read('packages/server/src/http/controllers/public/sitemap.controller.ts')
    expect(source).toContain("'public, no-cache'")
    expect(source).not.toContain('public, max-age=3600')
    expect(source).toContain('contentEtag')
    expect(source).toContain('etagHeaderMatches')
  })

  it('avatar answers emit a cache-control header (not a cache-busting default)', () => {
    const source = read('packages/server/src/http/controllers/public/avatar.controller.ts')
    expect(source).toContain('AVATAR_CACHE_CONTROL')
  })
})
