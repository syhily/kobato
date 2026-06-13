import { describe, expect, it } from 'vitest'

import { renderPortableTextToHtml } from '@/server/render/feed/feed-pt-render'
import { sanitizeFeedHtml } from '@/server/render/feed/generator'

// A typed stand-in for the NodePgDatabase argument. `renderPortableTextToHtml`
// only touches the DB when resolving music players; bodies without music
// players never call into it, so a cast is sufficient for these markup tests.
const fakeDb = {} as Parameters<typeof renderPortableTextToHtml>[0]

describe('feed-safety', () => {
  describe('sanitizeFeedHtml', () => {
    it('removes script tags', () => {
      const input = '<p>hello</p><script>alert(1)</script><p>world</p>'
      expect(sanitizeFeedHtml(input)).toBe('<p>hello</p><p>world</p>')
    })

    it('removes event handler attributes', () => {
      const input = '<img src="x" onerror="alert(1)"><p onclick="evil()">text</p>'
      const out = sanitizeFeedHtml(input)
      expect(out).not.toContain('onerror')
      expect(out).not.toContain('onclick')
      expect(out).not.toContain('evil')
    })

    it('neutralizes javascript: URLs', () => {
      const input = '<a href="javascript:alert(1)">click</a>'
      expect(sanitizeFeedHtml(input)).toBe('<a href="#">click</a>')
    })

    it('neutralizes data: URLs', () => {
      const input = '<a href="data:text/html,<script>alert(1)</script>">click</a>'
      expect(sanitizeFeedHtml(input)).toBe('<a href="#">click</a>')
    })

    it('strips SVG tags and their content', () => {
      const input = '<p>before</p><svg><animate onbegin="alert(1)" /></svg><p>after</p>'
      expect(sanitizeFeedHtml(input)).toBe('<p>before</p><p>after</p>')
    })

    it('strips MathML tags and their content', () => {
      const input = '<p>before</p><math><mi>x</mi></math><p>after</p>'
      expect(sanitizeFeedHtml(input)).toBe('<p>before</p><p>after</p>')
    })

    it('strips foreignObject, animate, animateMotion, animateTransform, and set tags', () => {
      const input =
        '<svg><foreignObject><script>alert(1)</script></foreignObject>' +
        '<animate attributeName="x" /><animateMotion /><animateTransform /><set /></svg>'
      expect(sanitizeFeedHtml(input)).toBe('')
    })
  })

  describe('renderPortableTextToHtml rssMode math', () => {
    it('renders inline math as TeX fallback in RSS mode, not MathML/SVG', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            children: [
              {
                _type: 'span',
                _key: 's1',
                text: 'E=mc^2',
                marks: ['m1'],
              },
            ],
            markDefs: [
              {
                _type: 'mathInline',
                _key: 'm1',
                tex: 'E=mc^2',
                mathml: '<math><mi>E</mi></math>',
                svg: '<svg><text>E</text></svg>',
              },
            ],
          },
        ],
        [],
        { rssMode: true },
      )

      expect(html).toContain('<code>E=mc^2</code>')
      expect(html).not.toContain('<math>')
      expect(html).not.toContain('<svg>')
    })

    it('renders math blocks as TeX fallback in RSS mode, not MathML/SVG', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [
          {
            _type: 'mathBlock',
            _key: 'mb1',
            tex: '\\int_0^1 x dx',
            mathml: '<math><mi>x</mi></math>',
            svg: '<svg><text>x</text></svg>',
          },
        ],
        [],
        { rssMode: true },
      )

      expect(html).toContain('<pre><code>\\int_0^1 x dx</code></pre>')
      expect(html).not.toContain('<math>')
      expect(html).not.toContain('<svg>')
    })

    it('still emits SVG for inline math when not in RSS mode', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            children: [
              {
                _type: 'span',
                _key: 's1',
                text: 'E=mc^2',
                marks: ['m1'],
              },
            ],
            markDefs: [
              {
                _type: 'mathInline',
                _key: 'm1',
                tex: 'E=mc^2',
                svg: '<svg><text>E</text></svg>',
              },
            ],
          },
        ],
        [],
        { rssMode: false },
      )

      expect(html).toContain('<svg>')
      expect(html).not.toContain('<code>E=mc^2</code>')
    })
  })
})
