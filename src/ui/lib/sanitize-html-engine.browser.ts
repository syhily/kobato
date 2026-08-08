import createDOMPurify from 'dompurify'

import type { SanitizeStrategyConfig } from '@/ui/lib/sanitize-html-config'

// Browser engine for `sanitizeHtmlString`; vite's client environment aliases
// the node engine's specifier here so the client bundle gets DOMPurify.

const purify = createDOMPurify()

// Mirrors sanitize-html's allowedSchemes: http/https/mailto + protocol-relative and relative URLs.
const ALLOWED_URI = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i

// Set per sanitize call so the style hook applies the right allowlist (hooks register once per instance).
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
  // Known divergence: DOMPurify drops a bare `<line>` tag even when allowlisted —
  // only legacy bodies on client re-render; SSR is unaffected.
  activeStyles = config.styles
  try {
    // ALLOWED_ATTR is string-only; the /^data-.*$/ RegExp maps to ALLOW_DATA_ATTR —
    // new RegExp attributes need a real translation.
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
