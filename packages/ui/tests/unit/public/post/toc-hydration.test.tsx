import { TableOfContents } from '@kobato/ui/public/post/TableOfContents'
// @vitest-environment jsdom
import { Writable } from 'node:stream'
import { hydrateRoot } from 'react-dom/client'
import { renderToPipeableStream } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

// Hydration contract for the TOC (audit: React error #418 on every warm
// visit after 6.7.1 lazy-wrapped it in a `fallback={null}` boundary):
//
// 1. SSR MUST render the closed-drawer DOM (toggle button + off-screen
//    drawer). A null fallback would drop it from the server output and the
//    client would render it back once the chunk resolves — a server-vs-
//    client element mismatch.
// 2. Hydration must succeed even when the motion chunk is ALREADY loaded
//    (modulepreload / HTTP cache): the lazy motion elements then resolve
//    to real motion components whose first frame must match the static
//    fallback markup.
function renderToPipeableStreamString(node: React.ReactNode): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = ''
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        out += chunk.toString()
        cb()
      },
      final(cb) {
        resolve(out)
        cb()
      },
    })
    const { pipe, abort } = renderToPipeableStream(node, {
      onAllReady: () => pipe(stream),
      onError: (error) => reject(error),
    })
    setTimeout(() => abort(), 5000)
  })
}

const headings = [
  { depth: 2, slug: 'intro', text: 'Intro' },
  { depth: 3, slug: 'details', text: 'Details' },
]

describe('ui/public/post/TableOfContents — hydration contract', () => {
  it('renders the closed-drawer DOM on the server (no null fallback)', async () => {
    const html = await renderToPipeableStreamString(<TableOfContents headings={headings} toc="enabled" />)
    // The toggle button and the off-screen drawer must be in the SSR
    // output — a lazy `fallback={null}` boundary would omit both and the
    // client would re-add them after hydration (error #418).
    expect(html).toContain('展开文章目录')
    expect(html).toContain('文章目录')
    expect(html).toContain('aria-expanded="false"')
    // Closed state: drawer pushed off-screen, inert, not focusable.
    expect(html).toContain('inert=""')
    expect(html).toContain('tabindex="-1"')
  })

  it('hydrates without a mismatch when the motion chunk is already loaded', async () => {
    const html = await renderToPipeableStreamString(<TableOfContents headings={headings} toc="enabled" />)

    // Warm the module cache exactly like a browser that already fetched the
    // motion chunk (modulepreload / HTTP cache) before hydration.
    await import('motion/react')

    document.body.innerHTML = `<div id="probe-root">${html}</div>`
    const errors: unknown[] = []
    hydrateRoot(document.getElementById('probe-root')!, <TableOfContents headings={headings} toc="enabled" />, {
      onRecoverableError: (error) => errors.push(error),
    })
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(errors.map((e) => (e instanceof Error ? e.message : String(e)))).toEqual([])
  })
})
