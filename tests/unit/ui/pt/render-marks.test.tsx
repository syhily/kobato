import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { LinkMarkDef } from '@/shared/pt/schema'

import { CodeBlockNodeComponent } from '@/ui/pt/render-blocks'
import { LinkMark, renderMathMarkupOrTexFallback } from '@/ui/pt/render-marks'

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
