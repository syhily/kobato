import type { ReactElement } from 'react'

import { SiGooglechrome, SiMacos } from '@icons-pack/react-simple-icons'
import { Globe, MonitorCheck } from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { wrapWithI18n } from '#/_helpers/i18n-render'
import { MetricName, flagEmojiFor, regionDisplayName } from '@/ui/admin/analytics/MetricName'

/** MetricName reads the UI translator; every render mounts the root provider. */
function renderMetric(node: ReactElement): string {
  return renderToStaticMarkup(wrapWithI18n(node))
}

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
    expect(renderMetric(<MetricName name="Chrome" type="browser" />)).toContain(iconMarkup(SiGooglechrome))
    expect(renderMetric(<MetricName name="chrome headless" type="browser" />)).toContain(iconMarkup(SiGooglechrome))
    expect(renderMetric(<MetricName name="macOS" type="os" />)).toContain(iconMarkup(SiMacos))
  })

  it('falls back to the dimension icon for unknown names', () => {
    expect(renderMetric(<MetricName name="Some Obscure Browser" type="browser" />)).toContain(iconMarkup(Globe))
    expect(renderMetric(<MetricName name="Some Obscure OS" type="os" />)).toContain(iconMarkup(MonitorCheck))
  })

  it('renders no icon when neither name nor dimension has one', () => {
    const html = renderMetric(<MetricName name="whatever" type="browserType" />)
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
    expect(regionDisplayName('CN', 'zh-CN')).toBe('中国')
    expect(regionDisplayName('US', 'zh-CN')).toBe('美国')
    expect(regionDisplayName('US', 'en-US')).toBe('United States')
    // Unknown/invalid input comes back verbatim instead of throwing.
    expect(regionDisplayName('not-a-code', 'zh-CN')).toBe('not-a-code')
  })
})

describe('ui/admin/analytics/MetricName bucket tokens', () => {
  it('translates the locale-neutral env bucket tokens while the filter keeps the token', () => {
    expect(renderMetric(<MetricName name="other" type="dpr" />)).toContain('其他')
    expect(renderMetric(<MetricName name="none" type="touch" />)).toContain('无触控')
    expect(renderMetric(<MetricName name="1-5" type="touch" />)).toContain('1–5 点')
    expect(renderMetric(<MetricName name="6-10" type="touch" />)).toContain('6–10 点')
    expect(renderMetric(<MetricName name="many" type="touch" />)).toContain('超过 10 点')
    // A real DPR bucket still renders verbatim (it is already locale-neutral).
    expect(renderMetric(<MetricName name="1.5x" type="dpr" />)).toContain('1.5x')
  })
})

describe('ui/admin/analytics/MetricName rendering', () => {
  it('country rows carry the flag and the localized name', () => {
    const html = renderMetric(<MetricName name="JP" type="country" />)
    expect(html).toContain('🇯🇵')
    expect(html).toContain('日本')
  })

  it('language rows localize the language code', () => {
    const html = renderMetric(<MetricName name="zh" type="language" />)
    expect(html).toContain('中文')
  })

  it('referer rows render a local letter avatar, never an external image', () => {
    const html = renderMetric(<MetricName name="t.co" type="referer" />)
    expect(html).not.toContain('<img')
    expect(html).toContain('t.co')
    // The avatar carries the host's first character (visually uppercased via CSS).
    expect(html).toContain('>t</span>')
  })

  it('browser rows render an inline icon plus the raw name', () => {
    const html = renderMetric(<MetricName name="Firefox" type="browser" />)
    expect(html).toContain('<svg')
    expect(html).toContain('Firefox')
  })

  it('region/city/timezone rows render the stored name verbatim', () => {
    const html = renderMetric(<MetricName name="Zhejiang" type="region" />)
    expect(html).toContain('Zhejiang')
    expect(html).not.toContain('<img')
  })

  it('empty names degrade to 直接访问 / 未知', () => {
    expect(renderMetric(<MetricName name="" type="referer" />)).toContain('直接访问')
    expect(renderMetric(<MetricName name="" type="os" />)).toContain('未知')
  })
})

describe('ui/admin/analytics/MetricName environment dimensions', () => {
  it('localizes the color scheme and uppercases the network type', () => {
    expect(renderMetric(<MetricName name="dark" type="colorScheme" />)).toContain('深色')
    expect(renderMetric(<MetricName name="light" type="colorScheme" />)).toContain('浅色')
    expect(renderMetric(<MetricName name="4g" type="netEffectiveType" />)).toContain('4G')
    expect(renderMetric(<MetricName name="slow-2g" type="netEffectiveType" />)).toContain('SLOW-2G')
  })

  it('renders bucket labels verbatim without an icon', () => {
    const viewport = renderMetric(<MetricName name="≤768" type="viewport" />)
    expect(viewport).toContain('≤768')
    expect(viewport).not.toContain('<svg')

    expect(renderMetric(<MetricName name="1920×1080" type="screen" />)).toContain('1920×1080')
    expect(renderMetric(<MetricName name="1–5 点" type="touch" />)).toContain('1–5 点')
    expect(renderMetric(<MetricName name="2.5x" type="dpr" />)).toContain('2.5x')
  })
})

describe('ui/admin/analytics/MetricName — en-US metric fallbacks', () => {
  function renderMetricEn(node: ReactElement): string {
    return renderToStaticMarkup(wrapWithI18n(node, { locale: 'en-US' }))
  }

  it('localizes empty names, direct traffic and the color scheme', () => {
    expect(renderMetricEn(<MetricName name="" type="referer" />)).toContain('Direct')
    expect(renderMetricEn(<MetricName name="" type="os" />)).toContain('Unknown')
    expect(renderMetricEn(<MetricName name="dark" type="colorScheme" />)).toContain('Dark')
    expect(renderMetricEn(<MetricName name="light" type="colorScheme" />)).toContain('Light')
  })
})
