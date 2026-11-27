import { DocumentShell } from '@kobato/ui/components/document-shell/DocumentShell'
import { useDocumentFacts } from '@kobato/ui/lib/document-facts-context'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { documentFactsFor } from '@kobato/ui/tests/utils/document-facts'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

const FONTS = {
  global: [{ family: 'Global Sans', href: 'https://fonts.example.com/embedded/aaaa/result.css' }],
  post: [{ family: 'Body Serif', href: 'https://fonts.example.com/embedded/bbbb/result.css' }],
  code: [{ family: 'Code Mono', href: 'https://fonts.example.com/embedded/cccc/result.css' }],
}

interface RenderOptions {
  postFonts?: boolean
  head?: boolean
  bodyEnd?: boolean
  facts?: Parameters<typeof documentFactsFor>[0]
}

function I18nProbe() {
  const { locale, t } = useI18n()
  return (
    <p data-testid="probe">
      {locale}|{t('common.action.save')}
    </p>
  )
}

function FactsProbe({ slot }: { slot: string }) {
  const facts = useDocumentFacts()
  return <span data-facts-slot={slot}>{facts.csrfToken ?? ''}</span>
}

function renderShell(options: RenderOptions = {}) {
  return renderToStaticMarkup(
    <DocumentShell
      facts={documentFactsFor(options.facts)}
      postFonts={options.postFonts}
      head={options.head ? <FactsProbe slot="head" /> : undefined}
      bodyEnd={options.bodyEnd ? <FactsProbe slot="body-end" /> : undefined}
    >
      <I18nProbe />
    </DocumentShell>,
  )
}

function styleVariables(html: string): string[] {
  const style = / style="([^"]*)"/.exec(html)?.[1] ?? ''
  return [...style.matchAll(/(--font-[a-z]+):/g)].map((match) => match[1]!)
}

describe('components/document-shell/DocumentShell', () => {
  it('renders the document element from the facts: language, no theme class, no font variables by default', () => {
    const html = renderShell({ facts: { settings: undefined } })

    expect(html.startsWith('<html lang="zh-CN"><head>')).toBe(true)
    expect(html).toContain('<meta name="color-scheme" content="light dark"/>')
    expect(html).not.toContain(' style="')
    expect(html).not.toContain('rel="stylesheet"')
    expect(html).not.toContain('rel="preconnect"')
  })

  it('preconnects the asset origin alone when no fonts are configured', () => {
    const html = renderShell()

    expect(html).toContain('<link rel="preconnect" href="https://assets.example.com" crossorigin=""/>')
    expect(html).not.toContain('rel="stylesheet"')
  })

  it('stamps the resolved theme as the class and the color-scheme meta', () => {
    const html = renderShell({ facts: { theme: 'dark' } })

    expect(html.startsWith('<html lang="zh-CN" class="dark"><head>')).toBe(true)
    expect(html).toContain('<meta name="color-scheme" content="dark"/>')
  })

  it('feeds the document locale and catalog to the route tree through I18nProvider', () => {
    const html = renderShell({ facts: { locale: 'en-US', messages: { 'common.action.save': 'Save' } } })

    expect(html).toContain('<html lang="en-US"')
    expect(html).toContain('en-US|Save')
  })

  it('emits the fixed head metas in order, then the font links, then the head slot', () => {
    const html = renderShell({ facts: { fonts: FONTS }, postFonts: true, head: true })

    const charset = html.indexOf('<meta charSet="utf-8"/>')
    const viewport = html.indexOf('<meta name="viewport" content="width=device-width, initial-scale=1"/>')
    const colorScheme = html.indexOf('<meta name="color-scheme"')
    const global = html.indexOf('<link rel="stylesheet" href="https://fonts.example.com/embedded/aaaa/result.css"/>')
    const post = html.indexOf('<link rel="stylesheet" href="https://fonts.example.com/embedded/bbbb/result.css"/>')
    const code = html.indexOf('<link rel="stylesheet" href="https://fonts.example.com/embedded/cccc/result.css"/>')
    const headSlot = html.indexOf('<span data-facts-slot="head">')

    expect(charset).toBeGreaterThan(-1)
    expect(viewport).toBeGreaterThan(charset)
    expect(colorScheme).toBeGreaterThan(viewport)
    expect(global).toBeGreaterThan(colorScheme)
    expect(post).toBeGreaterThan(global)
    expect(code).toBeGreaterThan(post)
    expect(headSlot).toBeGreaterThan(code)
    expect(html.indexOf('</head>')).toBeGreaterThan(headSlot)
  })

  it('limits the head to the global font set and its style variable on routes without the post fonts', () => {
    const html = renderShell({ facts: { fonts: FONTS }, postFonts: false })

    expect(html).toContain('<link rel="stylesheet" href="https://fonts.example.com/embedded/aaaa/result.css"/>')
    expect(html).not.toContain('bbbb/result.css')
    expect(html).not.toContain('cccc/result.css')
    expect(styleVariables(html)).toEqual(['--font-body'])
  })

  it('declares one style variable per active font set, each with the locale defaults appended', () => {
    const html = renderShell({ facts: { fonts: FONTS }, postFonts: true })

    expect(styleVariables(html)).toEqual(['--font-body', '--font-serif', '--font-code'])
    expect(html).toContain('--font-body:&#x27;Global Sans&#x27;, &#x27;OPPO Sans 4.0&#x27;')
    expect(html).toContain('--font-serif:&#x27;Body Serif&#x27;, &#x27;OPPO Serif SC&#x27;')
    expect(html).toContain('--font-code:&#x27;Code Mono&#x27;, &#x27;Iosevka&#x27;')
  })

  it('preconnects and DNS-prefetches the asset origin and the font origins into the head', () => {
    const html = renderShell({ facts: { fonts: FONTS }, postFonts: true })
    const head = html.slice(0, html.indexOf('</head>'))

    expect(head).toContain('<link rel="preconnect" href="https://assets.example.com" crossorigin=""/>')
    expect(head).toContain('<link rel="preconnect" href="https://fonts.example.com"/>')
    expect(head).toContain('<link href="https://fonts.example.com" rel="dns-prefetch"/>')
    expect(head).toContain('<link href="https://assets.example.com" rel="dns-prefetch"/>')
  })

  it('renders the children, then the chunk-reload overlay slot, then the body-end slot inside the catalog provider', () => {
    const html = renderShell({ bodyEnd: true })

    const body = html.indexOf('<body>')
    const children = html.indexOf('<p data-testid="probe">')
    const bodyEnd = html.indexOf('<span data-facts-slot="body-end">')
    expect(children).toBeGreaterThan(body)
    expect(bodyEnd).toBeGreaterThan(children)
    expect(html.indexOf('</body>')).toBeGreaterThan(bodyEnd)
    expect(html).not.toContain('<output')
  })

  it('hands the document facts to the head and body-end slots', () => {
    const html = renderShell({ facts: { csrfToken: 'slot-token' }, head: true, bodyEnd: true })

    expect(html).toContain('<span data-facts-slot="head">slot-token</span>')
    expect(html).toContain('<span data-facts-slot="body-end">slot-token</span>')
  })
})
