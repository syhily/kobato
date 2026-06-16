import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { LinkMarkDef } from '@/shared/pt/schema'

import { CodeBlockNodeComponent } from '@/ui/pt/render-blocks'
import { LinkMark, renderMathMarkupOrTexFallback } from '@/ui/pt/render-marks'

describe('security / tabnabbing — LinkMark rel on target="_blank"', () => {
  it('adds noopener noreferrer when target is _blank', () => {
    const value: LinkMarkDef = {
      _type: 'link',
      _key: 'k1',
      href: 'https://example.com',
      target: '_blank',
    }
    const html = renderToStaticMarkup(
      createElement(LinkMark, {
        value,
        children: 'blank link',
      } as React.ComponentProps<typeof LinkMark>),
    )
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('merges noopener noreferrer into existing rel', () => {
    const value: LinkMarkDef = {
      _type: 'link',
      _key: 'k1',
      href: 'https://example.com',
      rel: 'nofollow',
      target: '_blank',
    }
    const html = renderToStaticMarkup(
      createElement(LinkMark, {
        value,
        children: 'nofollow blank link',
      } as React.ComponentProps<typeof LinkMark>),
    )
    expect(html).toMatch(/rel="[^"]*noopener[^"]*"/)
    expect(html).toMatch(/rel="[^"]*noreferrer[^"]*"/)
    expect(html).toMatch(/rel="[^"]*nofollow[^"]*"/)
  })

  it('preserves existing rel when target is not _blank', () => {
    const value: LinkMarkDef = {
      _type: 'link',
      _key: 'k1',
      href: 'https://example.com',
      rel: 'nofollow',
    }
    const html = renderToStaticMarkup(
      createElement(LinkMark, {
        value,
        children: 'same-tab link',
      } as React.ComponentProps<typeof LinkMark>),
    )
    expect(html).toContain('rel="nofollow"')
  })
})

describe('security / XSS payload — PT renderer defense-in-depth', () => {
  it('LinkMark renders safe href unchanged', () => {
    const value: LinkMarkDef = {
      _type: 'link',
      _key: 'k1',
      href: 'https://example.com',
      rel: 'nofollow',
      target: '_blank',
    }
    const html = renderToStaticMarkup(
      createElement(LinkMark, {
        value,
        children: 'safe link',
      } as React.ComponentProps<typeof LinkMark>),
    )
    expect(html).toContain('href="https://example.com"')
  })

  it('LinkMark strips or neutralises javascript: href as defense-in-depth', () => {
    // If the schema filter is somehow bypassed, the renderer must not emit
    // executable JavaScript URLs. We test the renderer's fallback here.
    const value = {
      _type: 'link',
      _key: 'k1',
      href: "javascript:alert('xss')",
    } as unknown as LinkMarkDef
    const html = renderToStaticMarkup(
      createElement(LinkMark, {
        value,
        children: 'malicious link',
      } as React.ComponentProps<typeof LinkMark>),
    )
    // The renderer should either drop the href entirely or replace it with #
    expect(html).not.toContain("javascript:alert('xss')")
  })
})

describe('security / XSS payload — math markup', () => {
  it('escapes inline math tex that contains HTML', () => {
    const node = renderMathMarkupOrTexFallback('<script>alert(1)</script>', undefined, undefined, 'inline')
    const html = renderToStaticMarkup(node as React.ReactElement)
    expect(html).not.toContain('<script>')
  })
})

describe('security / XSS payload — code block', () => {
  it('escapes code block language injection', () => {
    const html = renderToStaticMarkup(
      createElement(CodeBlockNodeComponent, {
        value: {
          _type: 'code',
          _key: 'c1',
          language: 'js"><script>alert(1)</script>',
          code: 'const x = 1',
        },
      } as React.ComponentProps<typeof CodeBlockNodeComponent>),
    )
    expect(html).not.toContain('<script>')
  })
})
