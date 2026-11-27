import type { DocumentFacts, DocumentFontFace } from '@kobato/ui/lib/document-facts-context'
import type { ReactNode } from 'react'

import { ChunkReloadOverlay } from '@kobato/ui/components/ChunkReloadOverlay'
import { planDocumentHead } from '@kobato/ui/components/document-shell/document-head'
import { DocumentFactsProvider } from '@kobato/ui/lib/document-facts-context'
import { I18nProvider } from '@kobato/ui/lib/I18nProvider'
import { preconnect, prefetchDNS } from 'react-dom'

export interface DocumentShellProps {
  facts: DocumentFacts
  postFonts?: boolean
  head?: ReactNode
  bodyEnd?: ReactNode
  children?: ReactNode
}

export function DocumentShell({ facts, postFonts = false, head, bodyEnd, children }: DocumentShellProps) {
  const plan = planDocumentHead(facts, postFonts)

  for (const { origin, crossOrigin } of plan.preconnects) {
    preconnect(origin, crossOrigin === undefined ? undefined : { crossOrigin })
  }
  for (const origin of plan.dnsPrefetch) {
    prefetchDNS(origin)
  }

  return (
    <html lang={plan.lang} className={plan.themeClass} style={plan.htmlStyle}>
      <DocumentFactsProvider value={facts}>
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="color-scheme" content={plan.colorScheme} />
          {plan.fontSets.global.map((font) => fontLink('g', font))}
          {plan.fontSets.post.map((font) => fontLink('p', font))}
          {plan.fontSets.code.map((font) => fontLink('c', font))}
          {head}
        </head>
        <body>
          <I18nProvider locale={facts.locale} messages={facts.messages}>
            {children}
            <ChunkReloadOverlay />
            {bodyEnd}
          </I18nProvider>
        </body>
      </DocumentFactsProvider>
    </html>
  )
}

function fontLink(prefix: string, font: DocumentFontFace): ReactNode {
  return font.href ? <link key={`${prefix}-${font.href}`} rel="stylesheet" href={font.href} /> : null
}
