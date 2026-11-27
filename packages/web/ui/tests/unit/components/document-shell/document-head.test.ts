import { planDocumentHead } from '@kobato/ui/components/document-shell/document-head'
import { DEFAULT_FONT_STACKS } from '@kobato/ui/lib/font-stacks'
import { documentFactsFor } from '@kobato/ui/tests/utils/document-facts'
import { describe, expect, it } from 'vitest'

const FONTS = {
  global: [{ family: 'Global Sans', href: 'https://fonts.example.com/embedded/aaaa/result.css' }],
  post: [{ family: 'Body Serif', href: 'https://cdn.example.com/embedded/bbbb/result.css' }],
  code: [{ family: 'Code Mono', href: 'https://fonts.example.com/embedded/cccc/result.css' }],
}

const ASSET_ORIGIN = 'https://assets.example.com'

describe('components/document-shell/document-head — planDocumentHead', () => {
  it('maps the document language and the absence of a theme to the hybrid color-scheme', () => {
    const plan = planDocumentHead(documentFactsFor({ locale: 'zh-TW', theme: null }), false)

    expect(plan.lang).toBe('zh-TW')
    expect(plan.themeClass).toBeUndefined()
    expect(plan.colorScheme).toBe('light dark')
  })

  it('maps a resolved theme to the class and the color-scheme meta', () => {
    const dark = planDocumentHead(documentFactsFor({ theme: 'dark' }), false)
    const light = planDocumentHead(documentFactsFor({ theme: 'light' }), false)

    expect(dark.themeClass).toBe('dark')
    expect(dark.colorScheme).toBe('dark')
    expect(light.themeClass).toBe('light')
    expect(light.colorScheme).toBe('light')
  })

  it('emits only the global font set unless the matched route wants the post fonts', () => {
    const without = planDocumentHead(documentFactsFor({ fonts: FONTS }), false)

    expect(without.fontSets.global).toEqual(FONTS.global)
    expect(without.fontSets.post).toEqual([])
    expect(without.fontSets.code).toEqual([])
    expect(Object.keys(without.htmlStyle!)).toEqual(['--font-body'])
  })

  it('emits every font set and its style variable, locale defaults appended, on a post-fonts route', () => {
    const plan = planDocumentHead(documentFactsFor({ locale: 'en-US', fonts: FONTS }), true)

    expect(plan.fontSets.post).toEqual(FONTS.post)
    expect(plan.fontSets.code).toEqual(FONTS.code)
    expect(plan.htmlStyle).toEqual({
      '--font-body': `'Global Sans', ${DEFAULT_FONT_STACKS['en-US'].body}`,
      '--font-serif': `'Body Serif', ${DEFAULT_FONT_STACKS['en-US'].serif}`,
      '--font-code': `'Code Mono', ${DEFAULT_FONT_STACKS['en-US'].code}`,
    })
  })

  it('emits no style variables without configured fonts', () => {
    expect(planDocumentHead(documentFactsFor({ fonts: null }), true).htmlStyle).toBeUndefined()
  })

  it('preconnects the asset origin anonymously first, then every distinct origin, and DNS-prefetches each', () => {
    const plan = planDocumentHead(documentFactsFor({ fonts: FONTS }), true)

    expect(plan.preconnects).toEqual([
      { origin: ASSET_ORIGIN, crossOrigin: 'anonymous' },
      { origin: 'https://fonts.example.com' },
      { origin: 'https://cdn.example.com' },
      { origin: ASSET_ORIGIN },
    ])
    expect(plan.dnsPrefetch).toEqual(['https://fonts.example.com', 'https://cdn.example.com', ASSET_ORIGIN])
  })

  it('keeps a style variable for a set whose faces carry no usable href, but emits no preconnect for them', () => {
    const plan = planDocumentHead(
      documentFactsFor({
        fonts: {
          global: [],
          post: [
            { family: 'Local Only', href: '' },
            { family: 'Broken', href: 'not a url' },
          ],
          code: [],
        },
      }),
      true,
    )

    expect(Object.keys(plan.htmlStyle!)).toEqual(['--font-serif'])
    expect(plan.htmlStyle!['--font-serif']).toBe(`'Local Only', 'Broken', ${DEFAULT_FONT_STACKS['zh-CN'].serif}`)
    expect(plan.preconnects).toEqual([{ origin: ASSET_ORIGIN, crossOrigin: 'anonymous' }, { origin: ASSET_ORIGIN }])
    expect(plan.dnsPrefetch).toEqual([ASSET_ORIGIN])
  })

  it('emits no preconnects without fonts or an asset host', () => {
    const plan = planDocumentHead(documentFactsFor({ fonts: null, settings: undefined }), false)

    expect(plan.preconnects).toEqual([])
    expect(plan.dnsPrefetch).toEqual([])
  })
})
