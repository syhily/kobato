// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { strategyToConfig, type SafeHtmlStrategy } from '@/ui/lib/sanitize-html-config'
import { sanitizeHtmlEngine } from '@/ui/lib/sanitize-html-engine.browser'

// Parity suite for the DOMPurify browser engine (vite aliases the facade's
// engine import here); mirrors tests/unit/ui/lib/sanitize-html.test.ts.

const strategies: SafeHtmlStrategy[] = ['shiki', 'math', 'email', 'audit', 'preview']

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

    it('strips a bare line tag with its contents (known divergence from the node engine)', () => {
      // DOMPurify drops a bare <line> with its contents regardless of ALLOWED_TAGS; node engine keeps it.
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
