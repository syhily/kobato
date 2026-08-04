import type { SanitizeStrategyConfig } from '@kobato/shared/sanitize-html-config'

import sanitizeHtml, { type AllowedAttribute } from 'sanitize-html'

// Server/SSR engine for `sanitizeHtmlString`. In the browser bundle the
// `sanitize-html-engine-alias` vite plugin swaps this module for
// `./sanitize-html-engine.browser` so postcss and other Node-only
// sanitize-html dependencies never ship to the client.
export function sanitizeHtmlEngine(html: string, config: SanitizeStrategyConfig): string {
  return sanitizeHtml(html, {
    allowedTags: [...config.tags],
    // The sanitize-html typings don't expose RegExp in `AllowedAttribute`,
    // but the runtime matcher accepts it (the config's /^data-.*$/ entry).
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
