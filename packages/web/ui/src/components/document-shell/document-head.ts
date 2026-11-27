import type { AppLocale } from '@kobato/i18n/locales'
import type { DocumentFacts, DocumentFontFace } from '@kobato/ui/lib/document-facts-context'

import { defaultFontStackFor } from '@kobato/ui/lib/font-stacks'

export interface DocumentFontSets {
  global: readonly DocumentFontFace[]
  post: readonly DocumentFontFace[]
  code: readonly DocumentFontFace[]
}

export interface DocumentPreconnect {
  origin: string
  crossOrigin?: 'anonymous'
}

export interface DocumentHeadPlan {
  lang: AppLocale
  themeClass: 'dark' | 'light' | undefined
  colorScheme: string
  fontSets: DocumentFontSets
  htmlStyle: Record<string, string> | undefined
  preconnects: readonly DocumentPreconnect[]
  dnsPrefetch: readonly string[]
}

export function planDocumentHead(facts: DocumentFacts, postFonts: boolean): DocumentHeadPlan {
  const fontSets = activeFontSets(facts.fonts, postFonts)
  const origins = new Set<string>()
  for (const font of [...fontSets.global, ...fontSets.post, ...fontSets.code]) {
    if (!font.href) {
      continue
    }
    try {
      const origin = new URL(font.href).origin
      if (origin) {
        origins.add(origin)
      }
    } catch {}
  }

  const asset = facts.settings?.assets?.asset
  const assetOrigin = asset?.host ? `${asset.scheme ?? 'https'}://${asset.host}` : null
  const preconnects: DocumentPreconnect[] = []
  const dnsPrefetch: string[] = []
  if (assetOrigin !== null) {
    origins.add(assetOrigin)
    preconnects.push({ origin: assetOrigin, crossOrigin: 'anonymous' })
  }
  for (const origin of origins) {
    preconnects.push({ origin })
    dnsPrefetch.push(origin)
  }

  return {
    lang: facts.locale,
    themeClass: facts.theme ?? undefined,
    colorScheme: facts.theme ?? 'light dark',
    fontSets,
    htmlStyle: fontStyleVariables(fontSets, facts.locale),
    preconnects,
    dnsPrefetch,
  }
}

function activeFontSets(fonts: DocumentFacts['fonts'], postFonts: boolean): DocumentFontSets {
  const global = fonts?.global ?? []
  return {
    global,
    post: postFonts ? (fonts?.post ?? []) : [],
    code: postFonts ? (fonts?.code ?? []) : [],
  }
}

function fontStyleVariables(fontSets: DocumentFontSets, locale: AppLocale): Record<string, string> | undefined {
  const defaults = defaultFontStackFor(locale)
  const style: Record<string, string> = {}
  if (fontSets.global.length > 0) {
    style['--font-body'] = `${fontStack(fontSets.global)}, ${defaults.body}`
  }
  if (fontSets.post.length > 0) {
    style['--font-serif'] = `${fontStack(fontSets.post)}, ${defaults.serif}`
  }
  if (fontSets.code.length > 0) {
    style['--font-code'] = `${fontStack(fontSets.code)}, ${defaults.code}`
  }
  return Object.keys(style).length > 0 ? style : undefined
}

function fontStack(fonts: readonly DocumentFontFace[]): string {
  return fonts.map((font) => `'${font.family}'`).join(', ')
}
