import type { SanitizeStrategyConfig } from '@kobato/shared/sanitize-html-config'

import sanitizeHtml, { type AllowedAttribute } from 'sanitize-html'

// Server/SSR engine for `sanitizeHtmlString`. Server-side copy of the
// editor/ui node engine (the client twin is the DOMPurify browser engine
// in those packages); pinned against `packages/ui/lib/
// sanitize-html-engine.node.ts` by the parity guard in
// `packages/server/tests/unit/render/sanitize-html-parity.test.ts`.
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
