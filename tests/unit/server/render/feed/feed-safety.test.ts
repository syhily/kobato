import { describe, expect, it } from 'vitest'

import { lexicalBodyWith, lexicalParagraph } from '#/_helpers/lexical'
import { computeBodyProjections } from '@/server/infra/pt/lexical-projection'
import { sanitizeFeedHtml } from '@/server/render/feed/generator'
import { lexicalEditorStateSchema } from '@/shared/lexical/schema'

describe('feed-safety', () => {
  describe('sanitizeFeedHtml', () => {
    it('removes script tags', () => {
      const input = '<p>hello</p><script>alert(1)</script><p>world</p>'
      expect(sanitizeFeedHtml(input)).toBe('<p>hello</p><p>world</p>')
    })

    // Unclosed <script> tags must also be stripped.
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
      // sanitize-html drops the attribute rather than rewriting it to "#".
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

    it('keeps the inkling highlight <mark> (feed-variant projection emits it)', () => {
      const input = '<p>some <mark>highlighted</mark> text</p>'
      expect(sanitizeFeedHtml(input)).toBe(input)
    })
  })

  describe('feed-variant projection → sanitizeFeedHtml pipeline', () => {
    // RN-1 parity: the feed variant must emit escaped plain code, not CDATA —
    // sanitize-html drops CDATA sections wholesale.
    it('keeps the code text after sanitization when highlightedHtml is present', async () => {
      const state = lexicalEditorStateSchema.parse(
        lexicalBodyWith([
          {
            type: 'codeblock',
            version: 1,
            code: 'const answer = 42;',
            language: 'ts',
            caption: '',
            highlightedHtml: '<pre class="shiki"><code><span>const answer = 42;</span></code></pre>',
          },
        ]),
      )
      const { bodyHtmlFeed } = await computeBodyProjections(state)

      const out = sanitizeFeedHtml(bodyHtmlFeed)
      expect(out).toContain('const answer = 42;')
      expect(out).not.toContain('<![CDATA[')
      expect(out).not.toContain('shiki')
    })

    it('renders math as escaped TeX in the feed variant, not MathML/SVG', async () => {
      const state = lexicalEditorStateSchema.parse(
        lexicalBodyWith([
          { type: 'math', version: 1, tex: '\\int_0^1 x dx', mathml: '<math><mi>x</mi></math>', svg: '' },
          {
            type: 'paragraph',
            version: 1,
            direction: 'ltr',
            format: '',
            indent: 0,
            children: [{ type: 'math-inline', version: 1, tex: 'E=mc^2', mathml: '<math><mi>E</mi></math>', svg: '' }],
          },
          lexicalParagraph('plain'),
        ]),
      )
      const { bodyHtmlFeed } = await computeBodyProjections(state)

      const out = sanitizeFeedHtml(bodyHtmlFeed)
      expect(out).toContain('<pre><code>\\int_0^1 x dx</code></pre>')
      expect(out).toContain('<code class="inkling-math-inline">E=mc^2</code>')
      expect(out).not.toContain('<math>')
      expect(out).not.toContain('<svg>')
    })
  })
})
