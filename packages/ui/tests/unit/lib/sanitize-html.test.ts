import type { SafeHtmlStrategy } from '@kobato/ui/lib/sanitize-html-config'

import { sanitizeHtmlString } from '@kobato/ui/lib/sanitize-html'
import { describe, expect, it } from 'vitest'

const strategies: SafeHtmlStrategy[] = ['shiki', 'math', 'email', 'audit', 'preview']

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

  it('keeps allowed link schemes and strips javascript: links', () => {
    const html = '<a href="https://example.com">ok</a><a href="javascript:alert(1)">bad</a>'
    const clean = sanitizeHtmlString(html, 'audit')
    expect(clean).toContain('href="https://example.com"')
    expect(clean).not.toContain('javascript')
  })
})
