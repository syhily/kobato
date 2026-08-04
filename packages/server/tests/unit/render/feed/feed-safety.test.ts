import type { MusicEmbedResolver } from '@kobato/server/domains/lexical/embeds'
import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { sanitizeFeedHtml } from '@kobato/server/render/feed/generator'
import { renderLexicalBodyToHtml } from '@kobato/server/render/lexical-html'
import { describe, expect, it } from 'vitest'

// Bodies without music players never invoke the resolver, so a no-op
// embed-seam stub is sufficient for these markup tests.
const resolveMusicEmbeds: MusicEmbedResolver = async () => new Map()

describe('feed-safety', () => {
  describe('sanitizeFeedHtml', () => {
    it('removes script tags', () => {
      const input = '<p>hello</p><script>alert(1)</script><p>world</p>'
      expect(sanitizeFeedHtml(input)).toBe('<p>hello</p><p>world</p>')
    })

    // Regression: the old regex required a closing </script> tag, so an
    // unclosed `<script>` survived intact and ran in feed readers.
    it('strips unclosed <script> tags', () => {
      const input = '<p>hello</p><script>alert(1)'
      expect(sanitizeFeedHtml(input)).toBe('<p>hello</p>')
    })

    it('removes event handler attributes', () => {
      const input = '<img src="x" onerror="alert(1)"><p onclick="evil()">text</p>'
      const out = sanitizeFeedHtml(input)
      expect(out).not.toContain('onerror')
      expect(out).not.toContain('onclick')
      expect(out).not.toContain('evil')
    })

    // Regression: the old regex required whitespace before on\w+, so
    // `<img/onerror=...>` and `<img onerror=...>` (no quotes) bypassed it.
    it('strips event handlers regardless of separator (space, slash, none)', () => {
      const inputs = [
        '<img src="x" onerror="alert(1)">',
        '<img/onerror="alert(1)" src="x">',
        '<img onerror=alert(1) src="x">',
      ]
      for (const input of inputs) {
        expect(sanitizeFeedHtml(input)).not.toContain('onerror')
        expect(sanitizeFeedHtml(input)).not.toContain('alert')
      }
    })

    it('strips <iframe>, <object>, <embed>, <form>, and <base> tags', () => {
      const input =
        '<iframe src="javascript:alert(1)"></iframe>' +
        '<object data="evil.swf"></object>' +
        '<embed src="evil.swf">' +
        '<form action="javascript:alert(1)"><button>x</button></form>' +
        '<base href="javascript:alert(1)">'
      const out = sanitizeFeedHtml(input)
      expect(out).not.toContain('<iframe')
      expect(out).not.toContain('<object')
      expect(out).not.toContain('<embed')
      expect(out).not.toContain('<form')
      expect(out).not.toContain('<base')
      expect(out).not.toContain('alert')
    })

    it('strips <svg> entirely (including nested scripts and event handlers)', () => {
      const input = '<svg><script>alert(1)</script><animate onbegin="alert(1)" /></svg>'
      const out = sanitizeFeedHtml(input)
      expect(out).not.toContain('<svg')
      expect(out).not.toContain('<script')
      expect(out).not.toContain('<animate')
      expect(out).not.toContain('alert')
    })

    it('strips <math> and its child tags', () => {
      const input = '<p>before</p><math><mi>x</mi></math><p>after</p>'
      const out = sanitizeFeedHtml(input)
      expect(out).not.toContain('<math')
      expect(out).not.toContain('<mi>')
    })

    it('neutralizes javascript: URLs (drops href, keeps link text)', () => {
      const input = '<a href="javascript:alert(1)">click</a>'
      // sanitize-html removes the disallowed scheme attribute rather than
      // rewriting it to "#", which is the safer behaviour (no dead anchor).
      const out = sanitizeFeedHtml(input)
      expect(out).not.toContain('javascript:')
      expect(out).toContain('click')
    })

    it('neutralizes data: URLs on anchors (drops href, keeps link text)', () => {
      const input = '<a href="data:text/html,<script>alert(1)</script>">click</a>'
      const out = sanitizeFeedHtml(input)
      expect(out).not.toContain('data:')
      expect(out).not.toContain('<script')
      expect(out).toContain('click')
    })

    it('preserves legitimate HTML structure', () => {
      const input =
        '<h2 id="intro">Intro</h2><p>Hello <strong>world</strong> with ' +
        '<a href="https://example.com" rel="noopener noreferrer nofollow" target="_blank">a link</a>.</p>' +
        '<ul><li>one</li><li>two</li></ul>'
      const out = sanitizeFeedHtml(input)
      expect(out).toContain('<h2 id="intro">Intro</h2>')
      expect(out).toContain('<strong>world</strong>')
      expect(out).toContain('href="https://example.com"')
      expect(out).toContain('target="_blank"')
      expect(out).toContain('rel="noopener noreferrer nofollow"')
      expect(out).toContain('<ul><li>one</li><li>two</li></ul>')
    })

    it('preserves images with https src', () => {
      const input =
        '<figure><img src="https://example.com/a.png" alt="A" width="100" height="50"><figcaption>cap</figcaption></figure>'
      const out = sanitizeFeedHtml(input)
      expect(out).toContain('<img')
      expect(out).toContain('src="https://example.com/a.png"')
      expect(out).toContain('alt="A"')
      expect(out).toContain('width="100"')
      expect(out).toContain('<figcaption>cap</figcaption>')
    })
  })

  describe('renderLexicalBodyToHtml rssMode code → sanitizeFeedHtml pipeline', () => {
    // RN-1 regression (ported from the retired PT track): rssMode used to
    // CDATA-wrap the precomputed highlightedHtml, and sanitize-html drops
    // CDATA sections wholesale — every published post with a code block
    // shipped an empty <pre><code> box to feed subscribers. RSS mode must
    // emit the escaped plain code, which survives sanitization.
    it('keeps the code text after sanitization when highlightedHtml is present', async () => {
      const body: LexicalBody = {
        root: {
          direction: null,
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
          children: [
            {
              direction: null,
              format: '',
              indent: 0,
              type: 'code',
              version: 1,
              language: 'ts',
              highlightedHtml: '<pre class="shiki"><code><span>const answer = 42;</span></code></pre>',
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text: 'const answer = 42;',
                  type: 'text',
                  version: 1,
                },
              ],
            },
          ],
        },
      }

      const html = await renderLexicalBodyToHtml(body, [], resolveMusicEmbeds, { rssMode: true })

      const out = sanitizeFeedHtml(html)
      expect(out).toContain('const answer = 42;')
      expect(out).not.toContain('<![CDATA[')
      expect(out).not.toContain('shiki')
    })
  })

  describe('renderLexicalBodyToHtml rssMode math', () => {
    it('renders inline math as TeX fallback in RSS mode, not MathML/SVG', async () => {
      const body: LexicalBody = {
        root: {
          direction: null,
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
          children: [
            {
              direction: null,
              format: '',
              indent: 0,
              type: 'paragraph',
              version: 1,
              textFormat: 0,
              textStyle: '',
              children: [
                {
                  type: 'mathInline',
                  version: 1,
                  tex: 'E=mc^2',
                  mathml: '<math><mi>E</mi></math>',
                  svg: '<svg><text>E</text></svg>',
                },
              ],
            },
          ],
        },
      }

      const html = await renderLexicalBodyToHtml(body, [], resolveMusicEmbeds, { rssMode: true })

      expect(html).toContain('<code>E=mc^2</code>')
      expect(html).not.toContain('<math>')
      expect(html).not.toContain('<svg>')
    })

    it('renders math blocks as TeX fallback in RSS mode, not MathML/SVG', async () => {
      const body: LexicalBody = {
        root: {
          direction: null,
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
          children: [
            {
              type: 'mathBlock',
              version: 1,
              tex: '\\int_0^1 x dx',
              mathml: '<math><mi>x</mi></math>',
              svg: '<svg><text>x</text></svg>',
            },
          ],
        },
      }

      const html = await renderLexicalBodyToHtml(body, [], resolveMusicEmbeds, { rssMode: true })

      expect(html).toContain('<pre><code>\\int_0^1 x dx</code></pre>')
      expect(html).not.toContain('<math>')
      expect(html).not.toContain('<svg>')
    })

    it('still prefers the sanitized markup for inline math when not in RSS mode', async () => {
      const body: LexicalBody = {
        root: {
          direction: null,
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
          children: [
            {
              direction: null,
              format: '',
              indent: 0,
              type: 'paragraph',
              version: 1,
              textFormat: 0,
              textStyle: '',
              children: [{ type: 'mathInline', version: 1, tex: 'E=mc^2', svg: '<svg><text>E</text></svg>' }],
            },
          ],
        },
      }

      const html = await renderLexicalBodyToHtml(body, [], resolveMusicEmbeds, { rssMode: false })

      // The 'math' sanitize gate allows MathML but not `<svg>` — a legacy
      // svg-only payload survives as its text content, never as a raw tag
      // (the retired PT string renderer emitted raw SVG; the Lexical one
      // sanitizes both web and RSS forms).
      expect(html).not.toContain('<svg>')
      expect(html).not.toContain('<code>E=mc^2</code>')
      expect(html).toContain('math-inline')
    })
  })
})
