import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Feed format & content-type contract. RSS / Atom readers are notoriously
// strict; if the response stops being `application/atom+xml` or the feed
// generator drops the per-post `<content>`, subscribers see broken or empty
// items. We pin the contract by inspecting source rather than spinning up
// the full catalog (which would require the .source MDX corpus).
const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..')

const feedSource = readFileSync(resolve(projectRoot, 'src/server/render/feed/generator.tsx'), 'utf8')
const feedPtRenderSource = readFileSync(resolve(projectRoot, 'src/server/render/feed/feed-pt-render.tsx'), 'utf8')

describe('contract: feed (RSS + Atom) shape', () => {
  it('declares the historical content-types for both RSS and Atom', () => {
    expect(feedSource).toContain("rss: 'application/xml; charset=utf-8'")
    expect(feedSource).toContain("atom: 'application/atom+xml; charset=utf-8'")
  })

  it('does not pass `stylesheet` into the feed generator (avoids `<?xml-stylesheet?>`)', () => {
    expect(feedSource).not.toMatch(/\n\s*stylesheet:\s/m)
  })

  it('uses `WordPress 3.2.1` as the generator string (legacy compatibility)', () => {
    expect(feedSource).toContain("generator: 'WordPress 3.2.1'")
  })

  it('emits the feed in zh-CN', () => {
    expect(feedSource).toContain("language: 'zh-CN'")
  })

  it("renders each entry's full MDX body (not just the summary)", () => {
    // The feed delegates to the shared SSR helper in `feed-pt-render.tsx`,
    // which is the same path post/page detail routes use. We assert the
    // helper is wired in and that entry items receive the prerendered body
    // as `content`, so subscribers see the full post — not a summary stub.
    expect(feedPtRenderSource).toContain('prerenderToHtml')
    expect(feedSource).toContain('content: contents[i]')
  })

  it('category / tag feeds keep their /cats and /tags URL prefixes', () => {
    expect(feedSource).toContain('/cats/')
    expect(feedSource).toContain('/tags/')
  })
})
