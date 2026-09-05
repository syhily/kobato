// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { strategyToConfig, type SafeHtmlStrategy } from '@/ui/lib/sanitize-html-config'
import { sanitizeHtmlEngine } from '@/ui/lib/sanitize-html-engine.browser'

// Parity suite for the DOMPurify browser engine (vite aliases the facade's
// engine import here); mirrors tests/unit/ui/lib/sanitize-html.test.ts.

const strategies: SafeHtmlStrategy[] = ['shiki', 'math', 'email', 'audit', 'preview', 'body']

function clean(html: string, strategy: SafeHtmlStrategy): string {
  // Leading ZWSP shields the first element from a happy-dom-only DOMPurify quirk.
  return sanitizeHtmlEngine('​' + html, strategyToConfig(strategy))
}

describe('ui/lib/sanitize-html-engine.browser', () => {
  it('strips script tags for every strategy', () => {
    const dirty = '<script>alert(1)</script><p>safe</p>'
    for (const strategy of strategies) {
      expect(clean(dirty, strategy), `strategy=${strategy}`).not.toContain('<script')
      expect(clean(dirty, strategy), `strategy=${strategy}`).toContain('safe')
    }
  })

  it('strips event handlers for every strategy', () => {
    const dirty = '<p onclick="alert(1)">safe</p>'
    for (const strategy of strategies) {
      expect(clean(dirty, strategy), `strategy=${strategy}`).not.toContain('onclick')
      expect(clean(dirty, strategy), `strategy=${strategy}`).toContain('safe')
    }
  })

  it('keeps basic formatting tags for every strategy', () => {
    const html = '<p>hello <strong>world</strong> <em>italic</em></p>'
    for (const strategy of strategies) {
      expect(clean(html, strategy), `strategy=${strategy}`).toContain('<p>')
      expect(clean(html, strategy), `strategy=${strategy}`).toContain('<strong>')
      expect(clean(html, strategy), `strategy=${strategy}`).toContain('<em>')
    }
  })

  describe('shiki strategy', () => {
    it('preserves shiki inline styles and data attributes', () => {
      const html = '<pre data-language="ts"><code><span style="color:#ff0000">hi</span></code></pre>'
      const result = clean(html, 'shiki')
      expect(result).toContain('data-language="ts"')
      expect(result).toContain('style="color: #ff0000"')
      expect(result).toContain('<span')
    })

    it('strips dangerous style values from shiki blocks', () => {
      const html = '<span style="background:url(javascript:alert(1))">x</span>'
      expect(clean(html, 'shiki')).not.toContain('javascript')
    })

    it('drops the style attribute entirely when no declaration survives', () => {
      const html = '<span style="position:absolute;left:-9999px">x</span>'
      expect(clean(html, 'shiki')).not.toContain('style=')
    })

    it('keeps shiki theme custom properties', () => {
      const html = '<span style="--shiki-light:#111111;--shiki-dark:#eeeeee">x</span>'
      const result = clean(html, 'shiki')
      expect(result).toContain('--shiki-light: #111111')
      expect(result).toContain('--shiki-dark: #eeeeee')
    })

    it('strips a bare line tag with its contents', () => {
      // DOMPurify drops a bare <line> with its contents regardless of ALLOWED_TAGS.
      const result = clean('<line class="line">code</line>', 'shiki')
      expect(result).not.toContain('<line')
      expect(result).not.toContain('class="line"')
    })
  })

  describe('math strategy', () => {
    it('preserves MathML tags', () => {
      const html = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>x</mi></mrow></math>'
      const result = clean(html, 'math')
      expect(result).toContain('<math')
      expect(result).toContain('<mrow>')
      expect(result).toContain('<mi>x</mi>')
      expect(result).toContain('xmlns=')
    })

    it('preserves math attributes', () => {
      const html = '<math display="block" mathcolor="#ff0000"><mn>1</mn></math>'
      const result = clean(html, 'math')
      expect(result).toContain('display="block"')
      expect(result).toContain('mathcolor=')
    })
  })

  describe('email strategy', () => {
    it('preserves table layout attributes', () => {
      const html =
        '<table border="0" cellpadding="4" cellspacing="0" width="100%"><tr><td align="center">x</td></tr></table>'
      const result = clean(html, 'email')
      expect(result).toContain('border=')
      expect(result).toContain('cellpadding=')
      expect(result).toContain('cellspacing=')
      expect(result).toContain('width=')
      expect(result).toContain('align=')
    })

    it('preserves image src attributes', () => {
      const html = '<img src="https://example.com/pixel.png" alt="" width="1" height="1">'
      const result = clean(html, 'email')
      expect(result).toContain('src=')
      expect(result).toContain('width=')
      expect(result).toContain('height=')
    })
  })

  describe('audit/preview strategies', () => {
    it('strips table layout attributes for audit', () => {
      const html = '<table border="1"><tr><td>x</td></tr></table>'
      const result = clean(html, 'audit')
      expect(result).toContain('<table>')
      expect(result).not.toContain('border=')
    })

    it('strips inline styles for preview', () => {
      const html = '<p style="color:red">x</p>'
      const result = clean(html, 'preview')
      expect(result).toContain('<p>')
      expect(result).not.toContain('style=')
    })
  })

  describe('body strategy (saved body_html projection)', () => {
    it('preserves the figure/img export contract (srcset, thumbhash hook, lazy hints)', () => {
      const html =
        '<figure class="block max-w-full" data-layout="left"><img src="/storage/a.png" ' +
        'srcset="/storage/a.png 1x" sizes="100vw" width="800" height="450" alt="a" loading="lazy" ' +
        'decoding="async" data-thumbhash="1OcC" title="t"><figcaption>cap <strong>bold</strong></figcaption></figure>'
      const result = clean(html, 'body')
      expect(result).toContain('<figure')
      expect(result).toContain('data-layout="left"')
      expect(result).toContain('srcset="/storage/a.png 1x"')
      expect(result).toContain('loading="lazy"')
      expect(result).toContain('decoding="async"')
      expect(result).toContain('data-thumbhash="1OcC"')
      expect(result).toContain('<figcaption>')
      expect(result).toContain('<strong>bold</strong>')
    })

    it('keeps text-align and aspect-ratio styles, drops everything else', () => {
      const html =
        '<h3 id="heading-3" style="text-align: right; position:absolute">h</h3>' +
        '<img src="/x.png" style="aspect-ratio:16/9; left:-9999px">'
      const result = clean(html, 'body')
      expect(result).toContain('id="heading-3"')
      expect(result).toContain('text-align: right')
      expect(result).toContain('aspect-ratio: 16/9')
      expect(result).not.toContain('position')
      expect(result).not.toContain('-9999px')
    })

    it('preserves code-block hooks (data-code/data-language) and shiki span colors', () => {
      const html =
        '<pre><code class="language-typescript" data-language="typescript" data-code="const a = &lt;b&gt;">' +
        '<span class="line"><span style="color:#111">const</span></span></code></pre>'
      const result = clean(html, 'body')
      expect(result).toContain('data-language="typescript"')
      expect(result).toContain('data-code="const a = <b>"')
      expect(result).toContain('class="language-typescript"')
      expect(result).toContain('color: #111')
    })

    it('preserves the footnotes anchor contract', () => {
      const html =
        '<sup id="user-content-fnref-1"><a href="#user-content-fn-1">1</a></sup>' +
        '<section class="footnotes" data-footnotes="" aria-labelledby="footnotes-section-heading">' +
        '<h3 id="footnotes-section-heading">尾声礼记</h3><ol start="3"><li id="user-content-fn-1">' +
        '<p>note</p><a data-footnote-backref="" href="#user-content-fnref-1">↩</a></li></section>'
      const result = clean(html, 'body')
      expect(result).toContain('id="user-content-fnref-1"')
      expect(result).toContain('href="#user-content-fn-1"')
      expect(result).toContain('aria-labelledby="footnotes-section-heading"')
      expect(result).toContain('data-footnote-backref=""')
      expect(result).toContain('start="3"')
    })

    it('preserves the solution card inline SVG', () => {
      const html =
        '<blockquote class="solution relative"><span class="solution-qed" aria-hidden="true">' +
        '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">' +
        '<rect x="1" y="1" width="12" height="12"></rect></svg></span></blockquote>'
      const result = clean(html, 'body')
      expect(result).toContain('<svg')
      expect(result).toMatch(/viewbox="0 0 14 14"/i)
      expect(result).toContain('stroke-width="1.5"')
      expect(result).toContain('<rect')
      expect(result).toContain('aria-hidden="true"')
    })

    it('preserves math cards and the two-column grid hooks', () => {
      const html =
        '<div class="inkling-card inkling-math-card"><math display="block"><mrow><mi>x</mi></mrow></math></div>' +
        '<section data-pt-two-column=""><div data-pt-two-column-pane="" data-side="left"><p>l</p></div></section>'
      const result = clean(html, 'body')
      expect(result).toContain('<math display="block">')
      expect(result).toContain('<mi>x</mi>')
      expect(result).toContain('data-pt-two-column=""')
      expect(result).toContain('data-side="left"')
    })

    it('preserves music-player mount points and the audio fallback', () => {
      const html =
        '<div class="aplayer" data-id="1" data-name="n" data-artist="a" data-url="https://cdn/x.mp3" ' +
        'data-cover="https://cdn/c.jpg" data-lrc="[00:00]x"><div data-music-player-fallback="">' +
        '<img src="https://cdn/c.jpg"><span>n</span></div></div>' +
        '<figure><audio controls preload="none" src="https://cdn/x.mp3"></audio></figure>'
      const result = clean(html, 'body')
      expect(result).toContain('class="aplayer"')
      expect(result).toContain('data-url="https://cdn/x.mp3"')
      expect(result).toContain('data-music-player-fallback=""')
      expect(result).toContain('<audio controls="" preload="none" src="https://cdn/x.mp3">')
    })

    it('keeps extended inline marks (u/s/sup/sub/mark)', () => {
      const html = '<p><u>u</u><s>s</s><sup>sup</sup><sub>sub</sub><mark>m</mark></p>'
      const result = clean(html, 'body')
      for (const tag of ['u', 's', 'sup', 'sub', 'mark']) {
        expect(result).toContain(`<${tag}>`)
      }
    })

    it('strips javascript: URLs and event handlers from body markup', () => {
      const html = '<img src="javascript:alert(1)" onerror="alert(2)"><a href="javascript:alert(3)">x</a>'
      const result = clean(html, 'body')
      expect(result).not.toContain('javascript')
      expect(result).not.toContain('onerror')
    })
  })

  it('keeps allowed link schemes and strips javascript: links', () => {
    const html = '<a href="https://example.com">ok</a><a href="javascript:alert(1)">bad</a>'
    const result = clean(html, 'audit')
    expect(result).toContain('href="https://example.com"')
    expect(result).not.toContain('javascript')
  })

  it('keeps relative links (sanitize-html parity)', () => {
    const html = '<a href="/posts/hello">rel</a>'
    expect(clean(html, 'audit')).toContain('href="/posts/hello"')
  })
})
