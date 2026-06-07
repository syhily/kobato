import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Feed format & content-type contract. RSS / Atom readers are notoriously
// strict; if the response stops being `application/atom+xml` or the feed
// generator drops the per-post `<content>`, subscribers see broken or empty
// items. We pin the contract by inspecting source rather than spinning up
// the full catalog (which would require the .source MDX corpus).
const feedSource = readFileSync(resolve(process.cwd(), 'src/server/render/feed/generator.tsx'), 'utf8')
const feedPtRenderSource = readFileSync(resolve(process.cwd(), 'src/server/render/feed/feed-pt-render.ts'), 'utf8')

describe('contract: feed (RSS + Atom) shape', () => {
  it('declares the historical content-types for both RSS and Atom', () => {
    expect(feedSource).toContain("rss: 'application/xml; charset=utf-8'")
    expect(feedSource).toContain("atom: 'application/atom+xml; charset=utf-8'")
  })

  it('does not pass `stylesheet` into the feed generator (avoids `<?xml-stylesheet?>`)', () => {
    expect(feedSource).not.toMatch(/\n\s*stylesheet:\s/m)
  })

  it('does not set a custom generator string (uses the feed library default)', () => {
    expect(feedSource).not.toMatch(/\n\s*generator:\s/m)
  })

  it('emits the feed in zh-CN', () => {
    expect(feedSource).toContain("language: 'zh-CN'")
  })

  it("renders each entry's full MDX body (not just the summary)", () => {
    // The feed delegates to the shared SSR helper in `feed-pt-render.ts`,
    // which converts PortableText to HTML server-side via `@portabletext/to-html`.
    // We assert the helper is wired in and that entry items receive the rendered
    // body as `content`, so subscribers see the full post — not a summary stub.
    expect(feedPtRenderSource).toContain('toHTML')
    expect(feedSource).toContain('content: contents[i]')
  })

  it('category / tag feeds keep their /cats and /tags URL prefixes', () => {
    expect(feedSource).toContain('/cats/')
    expect(feedSource).toContain('/tags/')
  })
})
