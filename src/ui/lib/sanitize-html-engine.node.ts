import sanitizeHtml from 'sanitize-html'

import type { SanitizeStrategyConfig } from '@/ui/lib/sanitize-html-config'

// Server/SSR engine for `sanitizeHtmlString`; the `sanitize-html-engine-alias`
// vite plugin swaps this module for the browser engine in the client bundle.

// sanitize-html matches allowed attributes with indexOf / string globs — a
// RegExp entry never matches. Translate the /^data-.*$/ hook into the engine's
// native glob form so it works like DOMPurify's ALLOW_DATA_ATTR; any other
// pattern is a config bug (it would silently strip the attribute).
function translateAttribute(attr: string | RegExp): string {
  if (attr instanceof RegExp) {
    if (attr.source === '^data-.*$') {
      return 'data-*'
    }
    throw new Error(`sanitize-html engine cannot express the attribute pattern ${attr.source}`)
  }
  return attr
}

export function sanitizeHtmlEngine(html: string, config: SanitizeStrategyConfig): string {
  return sanitizeHtml(html, {
    allowedTags: [...config.tags],
    allowedAttributes: {
      '*': config.attributes.map(translateAttribute),
    },
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
