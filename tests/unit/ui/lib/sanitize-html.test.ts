import { describe, expect, it } from 'vitest'

import type { SafeHtmlStrategy } from '@/ui/lib/sanitize-html-config'

import { sanitizeHtmlString } from '@/ui/lib/sanitize-html'

const strategies: SafeHtmlStrategy[] = ['shiki', 'math', 'email', 'audit', 'preview', 'body']

describe('ui/lib/sanitize-html', () => {
  it('strips script tags for every strategy', () => {
    const dirty = '<script>alert(1)</script><p>safe</p>'
    for (const strategy of strategies) {
      const clean = sanitizeHtmlString(dirty, strategy)
      expect(clean, `strategy=${strategy}`).not.toContain('<script')
      expect(clean, `strategy=${strategy}`).toContain('safe')
    }
  })

  it('strips event handlers for every strategy', () => {
    const dirty = '<p onclick="alert(1)">safe</p>'
    for (const strategy of strategies) {
      const clean = sanitizeHtmlString(dirty, strategy)
      expect(clean, `strategy=${strategy}`).not.toContain('onclick')
      expect(clean, `strategy=${strategy}`).toContain('safe')
    }
  })

  it('keeps basic formatting tags for every strategy', () => {
    const html = '<p>hello <strong>world</strong> <em>italic</em></p>'
    for (const strategy of strategies) {
      const clean = sanitizeHtmlString(html, strategy)
      expect(clean, `strategy=${strategy}`).toContain('<p>')
      expect(clean, `strategy=${strategy}`).toContain('<strong>')
      expect(clean, `strategy=${strategy}`).toContain('<em>')
    }
  })

  describe('shiki strategy', () => {
    it('preserves shiki inline styles and data attributes', () => {
      const html = '<pre data-language="ts"><code><span style="color:#ff0000">hi</span></code></pre>'
      const clean = sanitizeHtmlString(html, 'shiki')
      expect(clean).toContain('data-language="ts"')
      expect(clean).toContain('style="color:#ff0000"')
      expect(clean).toContain('<span')
    })

    it('strips dangerous style values from shiki blocks', () => {
      const html = '<span style="background:url(javascript:alert(1))">x</span>'
      const clean = sanitizeHtmlString(html, 'shiki')
      expect(clean).not.toContain('javascript')
    })

    it('allows the line tag used by shiki', () => {
      const html = '<line class="line">code</line>'
      const clean = sanitizeHtmlString(html, 'shiki')
      expect(clean).toContain('<line')
    })
  })

  describe('math strategy', () => {
    it('preserves MathML tags', () => {
      const html = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>x</mi></mrow></math>'
      const clean = sanitizeHtmlString(html, 'math')
      expect(clean).toContain('<math')
      expect(clean).toContain('<mrow>')
      expect(clean).toContain('<mi>x</mi>')
      expect(clean).toContain('xmlns=')
    })

    it('preserves math attributes', () => {
      const html = '<math display="block" mathcolor="#ff0000"><mn>1</mn></math>'
      const clean = sanitizeHtmlString(html, 'math')
      expect(clean).toContain('display="block"')
      expect(clean).toContain('mathcolor=')
    })
  })

  describe('email strategy', () => {
    it('preserves table layout attributes', () => {
      const html =
        '<table border="0" cellpadding="4" cellspacing="0" width="100%"><tr><td align="center">x</td></tr></table>'
      const clean = sanitizeHtmlString(html, 'email')
      expect(clean).toContain('border=')
      expect(clean).toContain('cellpadding=')
      expect(clean).toContain('cellspacing=')
      expect(clean).toContain('width=')
      expect(clean).toContain('align=')
    })

    it('preserves bgcolor and color attributes', () => {
      const html = '<p bgcolor="#ffffff" color="#000000">newsletter</p>'
      const clean = sanitizeHtmlString(html, 'email')
      expect(clean).toContain('bgcolor=')
      expect(clean).toContain('color=')
    })

    it('preserves image src attributes', () => {
      const html = '<img src="https://example.com/pixel.png" alt="" width="1" height="1">'
      const clean = sanitizeHtmlString(html, 'email')
      expect(clean).toContain('src=')
      expect(clean).toContain('width=')
      expect(clean).toContain('height=')
    })
  })

  describe('audit/preview strategies', () => {
    it('strips table layout attributes for audit', () => {
      const html = '<table border="1"><tr><td>x</td></tr></table>'
      const clean = sanitizeHtmlString(html, 'audit')
      expect(clean).toContain('<table>')
      expect(clean).not.toContain('border=')
    })

    it('strips inline styles for preview', () => {
      const html = '<p style="color:red">x</p>'
      const clean = sanitizeHtmlString(html, 'preview')
      expect(clean).toContain('<p>')
      expect(clean).not.toContain('style=')
    })
  })

  describe('body strategy (saved body_html projection)', () => {
    it('preserves the figure/img export contract (srcset, thumbhash hook, lazy hints)', () => {
      const html =
        '<figure class="block max-w-full" data-layout="left"><img src="/storage/a.png" ' +
        'srcset="/storage/a.png 1x" sizes="100vw" width="800" height="450" alt="a" loading="lazy" ' +
        'decoding="async" data-thumbhash="1OcC" title="t"><figcaption>cap <strong>bold</strong></figcaption></figure>'
      const clean = sanitizeHtmlString(html, 'body')
      expect(clean).toContain('<figure')
      expect(clean).toContain('data-layout="left"')
      expect(clean).toContain('srcset="/storage/a.png 1x"')
      expect(clean).toContain('loading="lazy"')
      expect(clean).toContain('decoding="async"')
      expect(clean).toContain('data-thumbhash="1OcC"')
      expect(clean).toContain('<figcaption>')
      expect(clean).toContain('<strong>bold</strong>')
    })

    it('keeps text-align and aspect-ratio styles, drops everything else', () => {
      const html =
        '<h3 id="heading-3" style="text-align: right; position:absolute">h</h3>' +
        '<img src="/x.png" style="aspect-ratio:16/9; left:-9999px">'
      const clean = sanitizeHtmlString(html, 'body')
      expect(clean).toContain('id="heading-3"')
      expect(clean).toContain('text-align')
      expect(clean).toContain('right')
      expect(clean).toContain('aspect-ratio')
      expect(clean).not.toContain('position')
      expect(clean).not.toContain('-9999px')
    })

    it('preserves code-block hooks (data-code/data-language) and shiki span colors', () => {
      const html =
        '<pre><code class="language-typescript" data-language="typescript" data-code="const a = &lt;b&gt;">' +
        '<span class="line"><span style="color:#111">const</span></span></code></pre>'
      const clean = sanitizeHtmlString(html, 'body')
      expect(clean).toContain('data-language="typescript"')
      expect(clean).toContain('data-code="const a = &lt;b&gt;"')
      expect(clean).toContain('class="language-typescript"')
      expect(clean).toContain('color:#111')
    })

    it('preserves the footnotes anchor contract', () => {
      const html =
        '<sup id="user-content-fnref-1"><a href="#user-content-fn-1">1</a></sup>' +
        '<section class="footnotes" data-footnotes="" aria-labelledby="footnotes-section-heading">' +
        '<h3 id="footnotes-section-heading">尾声礼记</h3><ol start="3"><li id="user-content-fn-1">' +
        '<p>note</p><a data-footnote-backref="" href="#user-content-fnref-1">↩</a></li></ol></section>'
      const clean = sanitizeHtmlString(html, 'body')
      expect(clean).toContain('id="user-content-fnref-1"')
      expect(clean).toContain('href="#user-content-fn-1"')
      expect(clean).toContain('aria-labelledby="footnotes-section-heading"')
      expect(clean).toContain('data-footnote-backref')
      expect(clean).toContain('start="3"')
    })

    it('preserves the solution card inline SVG', () => {
      const html =
        '<blockquote class="solution relative"><span class="solution-qed" aria-hidden="true">' +
        '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">' +
        '<rect x="1" y="1" width="12" height="12"></rect></svg></span></blockquote>'
      const clean = sanitizeHtmlString(html, 'body')
      expect(clean).toContain('<svg')
      expect(clean).toMatch(/viewbox="0 0 14 14"/i)
      expect(clean).toContain('stroke-width="1.5"')
      expect(clean).toContain('<rect')
      expect(clean).toContain('aria-hidden="true"')
    })

    it('preserves math cards and the two-column grid hooks', () => {
      const html =
        '<div class="inkling-card inkling-math-card"><math display="block"><mrow><mi>x</mi></mrow></math></div>' +
        '<section data-pt-two-column=""><div data-pt-two-column-pane="" data-side="left"><p>l</p></div></section>'
      const clean = sanitizeHtmlString(html, 'body')
      expect(clean).toContain('<math display="block">')
      expect(clean).toContain('<mi>x</mi>')
      expect(clean).toContain('data-pt-two-column')
      expect(clean).toContain('data-side="left"')
    })

    it('preserves music-player mount points and the audio fallback', () => {
      const html =
        '<div class="aplayer" data-id="1" data-name="n" data-artist="a" data-url="https://cdn/x.mp3" ' +
        'data-cover="https://cdn/c.jpg" data-lrc="[00:00]x"><div data-music-player-fallback="">' +
        '<img src="https://cdn/c.jpg"><span>n</span></div></div>' +
        '<figure><audio controls preload="none" src="https://cdn/x.mp3"></audio></figure>'
      const clean = sanitizeHtmlString(html, 'body')
      expect(clean).toContain('class="aplayer"')
      expect(clean).toContain('data-url="https://cdn/x.mp3"')
      expect(clean).toContain('data-music-player-fallback')
      expect(clean).toContain('<audio controls preload="none" src="https://cdn/x.mp3">')
    })

    it('keeps extended inline marks (u/s/sup/sub/mark)', () => {
      const html = '<p><u>u</u><s>s</s><sup>sup</sup><sub>sub</sub><mark>m</mark></p>'
      const clean = sanitizeHtmlString(html, 'body')
      for (const tag of ['u', 's', 'sup', 'sub', 'mark']) {
        expect(clean).toContain(`<${tag}>`)
      }
    })

    it('strips javascript: URLs and event handlers from body markup', () => {
      const html = '<img src="javascript:alert(1)" onerror="alert(2)"><a href="javascript:alert(3)">x</a>'
      const clean = sanitizeHtmlString(html, 'body')
      expect(clean).not.toContain('javascript')
      expect(clean).not.toContain('onerror')
    })
  })

  it('keeps allowed link schemes and strips javascript: links', () => {
    const html = '<a href="https://example.com">ok</a><a href="javascript:alert(1)">bad</a>'
    const clean = sanitizeHtmlString(html, 'audit')
    expect(clean).toContain('href="https://example.com"')
    expect(clean).not.toContain('javascript')
  })
})
