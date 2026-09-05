// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { strategyToConfig, type SafeHtmlStrategy } from '@/ui/lib/sanitize-html-config'
import { sanitizeHtmlEngine as browserEngine } from '@/ui/lib/sanitize-html-engine.browser'
import { sanitizeHtmlEngine as nodeEngine } from '@/ui/lib/sanitize-html-engine.node'

// Byte-parity pin for the two sanitize engine entry points. SSR ships the
// node engine's output and hydration compares it against the client render's
// `__html` string, so the two must produce identical BYTES — behavioral
// equivalence is not enough (R16h: the old sanitize-html/DOMPurify split
// mismatched on 859/9031 dev-DB rows; R16i replaced it with one shared
// DOMPurify core, engines differing only in the DOM they bind). This file
// keeps asserting `node === browser` on fixtures covering every historical
// divergence class, so a future regression in the shared-core wiring or a
// DOMPurify upgrade behavior change fails here instead of hydrating badly.

function expectParity(html: string, strategy: SafeHtmlStrategy): void {
  const config = strategyToConfig(strategy)
  expect(nodeEngine(html, config), `strategy=${strategy} html=${html.slice(0, 60)}`).toBe(browserEngine(html, config))
}

describe('ui/lib/sanitize-html engine byte parity', () => {
  it('void elements serialize without the XHTML slash', () => {
    expectParity('<p>a</p><hr><br><img src="/storage/x.png" alt="x">', 'body')
  })

  it('valueless attributes serialize with an explicit empty value', () => {
    expectParity('<section class="footnotes" data-footnotes=""><p>note</p></section>', 'body')
  })

  it('trims leading/trailing whitespace in attribute values (music card lrc)', () => {
    expectParity(
      '<div class="aplayer" data-lrc="[00:00]a\n[01:00]b\n" data-music-player-fallback="">' +
        '<img src="/storage/c.jpg" alt="c"></div>',
      'body',
    )
  })

  it('drops attributes whose value carries a raw-text closer (SAFE_FOR_XML)', () => {
    expectParity(
      '<pre><code class="language-html" data-language="html" ' +
        'data-code="&lt;title&gt;t&lt;/title&gt;"><span class="line">x</span></code></pre>',
      'body',
    )
    expectParity('<p title="a --> b">x</p>', 'body')
  })

  it('respaces style declarations to the browser hook form', () => {
    expectParity('<p style="text-align:right">t</p>', 'body')
    expectParity('<p style=" text-align : right ; position:absolute ">t</p>', 'body')
    expectParity(
      '<pre class="shiki" style="--shiki-light:#657B83;--shiki-dark:#839496"><code><span style="color:#111">x</span></code></pre>',
      'shiki',
    )
  })

  it('figure/img export contract with srcset entity escaping', () => {
    expectParity(
      '<figure class="block max-w-full" data-layout="left"><img src="/storage/a.png?w=768&h=554" ' +
        'srcset="/storage/a.png?w=768&h=554 768w, /storage/a.png?w=1024&h=738 1024w" sizes="100vw" ' +
        'width="800" height="450" alt="a" loading="lazy" decoding="async" data-thumbhash="1OcC">' +
        '<figcaption>cap <strong>bold</strong></figcaption></figure>',
      'body',
    )
  })

  it('solution card inline SVG', () => {
    expectParity(
      '<blockquote class="solution relative"><span class="solution-qed" aria-hidden="true">' +
        '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">' +
        '<rect x="1" y="1" width="12" height="12"></rect></svg></span></blockquote>',
      'body',
    )
  })

  it('math strategy MathML', () => {
    expectParity(
      '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>x</mi><mo>=</mo><mn>1</mn></mrow></math>',
      'math',
    )
  })

  it('email strategy table layout', () => {
    expectParity(
      '<table border="0" cellpadding="4" cellspacing="0" width="100%"><tr><td align="center">x</td></tr></table>',
      'email',
    )
  })

  it('two-column and audio fallback hooks', () => {
    expectParity(
      '<section data-pt-two-column=""><div data-pt-two-column-pane="" data-side="left"><p>l</p></div>' +
        '<div data-pt-two-column-pane="" data-side="right"><p>r</p></div></section>' +
        '<figure><audio controls preload="none" src="/storage/m.mp3"></audio></figure>',
      'body',
    )
  })
})
