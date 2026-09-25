import { SiGooglechrome, SiMacos } from '@icons-pack/react-simple-icons'
import { Globe, MonitorCheck } from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MetricName, flagEmojiFor, regionDisplayName } from '@/ui/admin/analytics/MetricName'

// Brand-icon / flag selection for metric rows (Slite's metrics/name/*
// port). Referer rows render a local letter avatar — no third-party favicon
// request (CSP img-src 'self' + referer-host privacy). Icon selection is
// asserted through the component's own render path — there is no separate
// lookup helper to pin.

/** SSR markup of an icon exactly as MetricName renders it inline. */
function iconMarkup(Icon: typeof SiGooglechrome): string {
  return renderToStaticMarkup(<Icon aria-hidden className="mt-0.5 size-4 shrink-0" />)
}

describe('ui/admin/analytics/MetricName icon selection', () => {
  it('maps exact lowercase names to brand icons', () => {
    expect(renderToStaticMarkup(<MetricName name="Chrome" type="browser" />)).toContain(iconMarkup(SiGooglechrome))
    expect(renderToStaticMarkup(<MetricName name="chrome headless" type="browser" />)).toContain(
      iconMarkup(SiGooglechrome),
    )
    expect(renderToStaticMarkup(<MetricName name="macOS" type="os" />)).toContain(iconMarkup(SiMacos))
  })

  it('falls back to the dimension icon for unknown names', () => {
    expect(renderToStaticMarkup(<MetricName name="Some Obscure Browser" type="browser" />)).toContain(iconMarkup(Globe))
    expect(renderToStaticMarkup(<MetricName name="Some Obscure OS" type="os" />)).toContain(iconMarkup(MonitorCheck))
  })

  it('renders no icon when neither name nor dimension has one', () => {
    const html = renderToStaticMarkup(<MetricName name="whatever" type="browserType" />)
    expect(html).not.toContain('<svg')
    expect(html).toContain('whatever')
  })

  it('builds flag emoji only from ISO alpha-2 codes', () => {
    expect(flagEmojiFor('CN')).toBe('🇨🇳')
    expect(flagEmojiFor('us')).toBe('🇺🇸')
    expect(flagEmojiFor('')).toBe('')
    expect(flagEmojiFor('USA')).toBe('')
    expect(flagEmojiFor('C1')).toBe('')
  })

  it('resolves zh-CN region names and survives invalid codes', () => {
    expect(regionDisplayName('CN')).toBe('中国')
    expect(regionDisplayName('US')).toBe('美国')
    // Unknown/invalid input comes back verbatim instead of throwing.
    expect(regionDisplayName('not-a-code')).toBe('not-a-code')
  })
})

describe('ui/admin/analytics/MetricName rendering', () => {
  it('country rows carry the flag and the localized name', () => {
    const html = renderToStaticMarkup(<MetricName name="JP" type="country" />)
    expect(html).toContain('🇯🇵')
    expect(html).toContain('日本')
  })

  it('language rows localize the language code', () => {
    const html = renderToStaticMarkup(<MetricName name="zh" type="language" />)
    expect(html).toContain('中文')
  })

  it('referer rows render a local letter avatar, never an external image', () => {
    const html = renderToStaticMarkup(<MetricName name="t.co" type="referer" />)
    expect(html).not.toContain('<img')
    expect(html).toContain('t.co')
    // The avatar carries the host's first character (visually uppercased via CSS).
    expect(html).toContain('>t</span>')
  })

  it('browser rows render an inline icon plus the raw name', () => {
    const html = renderToStaticMarkup(<MetricName name="Firefox" type="browser" />)
    expect(html).toContain('<svg')
    expect(html).toContain('Firefox')
  })

  it('region/city/timezone rows render the stored name verbatim', () => {
    const html = renderToStaticMarkup(<MetricName name="Zhejiang" type="region" />)
    expect(html).toContain('Zhejiang')
    expect(html).not.toContain('<img')
  })

  it('empty names degrade to 直接访问 / 未知', () => {
    expect(renderToStaticMarkup(<MetricName name="" type="referer" />)).toContain('直接访问')
    expect(renderToStaticMarkup(<MetricName name="" type="os" />)).toContain('未知')
  })
})
