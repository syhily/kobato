import type { SanitizeStrategyConfig } from '@kobato/shared/sanitize-html-config'

import createDOMPurify from 'dompurify'

// Browser engine for `sanitizeHtmlString`. The facade imports the node
// engine by name; vite's client environment aliases that specifier here
// (see vite.config.ts) so the client bundle gets DOMPurify instead of
// sanitize-html + postcss (Node-only, and the source of vite's
// "externalized for browser compatibility" warnings).

const purify = createDOMPurify()

// Mirrors the `allowedSchemes: ['http', 'https', 'mailto']` semantics of
// sanitize-html: those schemes plus protocol-relative and relative URLs.
const ALLOWED_URI = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i

// Set for the duration of each sanitize call so the style hook knows which
// allowlist to apply (hooks are registered once per DOMPurify instance).
let activeStyles: Readonly<Record<string, readonly RegExp[]>> | undefined

function filterStyleAttribute(value: string, allowed: Readonly<Record<string, readonly RegExp[]>>): string {
  return value
    .split(';')
    .map((declaration) => {
      const separator = declaration.indexOf(':')
      if (separator <= 0) {
        return ''
      }
      const property = declaration.slice(0, separator).trim().toLowerCase()
      const propertyValue = declaration.slice(separator + 1).trim()
      const patterns = allowed[property]
      if (patterns === undefined || propertyValue === '' || !patterns.some((pattern) => pattern.test(propertyValue))) {
        return ''
      }
      return `${property}: ${propertyValue}`
    })
    .filter((declaration) => declaration !== '')
    .join('; ')
}

purify.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName !== 'style' || activeStyles === undefined) {
    return
  }
  const filtered = filterStyleAttribute(data.attrValue, activeStyles)
  if (filtered === '') {
    node.removeAttribute('style')
    return
  }
  data.attrValue = filtered
})

export function sanitizeHtmlEngine(html: string, config: SanitizeStrategyConfig): string {
  // Known divergence from the node engine: DOMPurify removes a bare `<line>`
  // tag with its contents (treats it as an SVG element out of context) even
  // when allowlisted. Nothing in the current shiki pipeline emits `<line>`
  // (it uses `<span class="line">`), so this only affects legacy bodies on
  // client-side re-render — SSR (node engine) is unaffected.
  activeStyles = config.styles
  try {
    // ALLOWED_ATTR is string-only; the config's one RegExp entry is the
    // /^data-.*$/ wildcard, which DOMPurify expresses as ALLOW_DATA_ATTR.
    // If another RegExp attribute is ever added, it needs a real translation.
    const hasDataAttr = config.attributes.some((attr) => attr instanceof RegExp)
    return purify.sanitize(html, {
      ALLOWED_TAGS: [...config.tags],
      ALLOWED_ATTR: config.attributes.filter((attr): attr is string => typeof attr === 'string'),
      ALLOWED_URI_REGEXP: ALLOWED_URI,
      ...(hasDataAttr ? { ALLOW_DATA_ATTR: true } : {}),
    })
  } finally {
    activeStyles = undefined
  }
}
