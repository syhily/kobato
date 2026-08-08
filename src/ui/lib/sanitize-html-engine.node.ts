import sanitizeHtml, { type AllowedAttribute } from 'sanitize-html'

import type { SanitizeStrategyConfig } from '@/ui/lib/sanitize-html-config'

// Server/SSR engine for `sanitizeHtmlString`; the `sanitize-html-engine-alias`
// vite plugin swaps this module for the browser engine in the client bundle.
export function sanitizeHtmlEngine(html: string, config: SanitizeStrategyConfig): string {
  return sanitizeHtml(html, {
    allowedTags: [...config.tags],
    // Typings don't expose RegExp in `AllowedAttribute`, but the runtime matcher accepts it.
    // eslint-disable-next-line ts/no-unsafe-type-assertion
    allowedAttributes: { '*': [...config.attributes] as unknown as AllowedAttribute[] },
    allowedSchemes: [...config.schemes],
    ...(config.styles === undefined
      ? {}
      : {
          allowedStyles: {
            '*': Object.fromEntries(
              Object.entries(config.styles).map(([property, patterns]) => [property, [...patterns]]),
            ),
          },
        }),
  })
}
