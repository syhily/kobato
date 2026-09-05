import type createDOMPurify from 'dompurify'

import type { SanitizeStrategyConfig } from '@/ui/lib/sanitize-html-config'

// Shared DOMPurify core for both sanitize engines. The engine files differ
// only in WHERE the DOM comes from (browser global vs a process-cached
// jsdom); every behavioral rule lives here once so the SSR bytes and the
// hydration bytes can never drift apart (R16h/R16i: the previous
// sanitize-html/DOMPurify pair diverged byte-wise on 859/9031 dev-DB rows).

type Purify = ReturnType<typeof createDOMPurify>

// Mirrors the old sanitize-html allowedSchemes: http/https/mailto +
// protocol-relative and relative URLs.
const ALLOWED_URI = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i

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

/**
 * Bind one DOMPurify instance to the strategy config: attaches the style
 * allowlist hook once and returns the sanitize function. The `activeStyles`
 * slot is per-instance state set around each call (hooks register once per
 * DOMPurify instance, so the style allowlist for the CURRENT strategy travels
 * through the closure, not the config).
 */
export function createPurifySanitizer(purify: Purify): (html: string, config: SanitizeStrategyConfig) => string {
  let activeStyles: Readonly<Record<string, readonly RegExp[]>> | undefined

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

  return (html, config) => {
    activeStyles = config.styles
    try {
      // ALLOWED_ATTR is string-only; the /^data-.*$/ RegExp maps to
      // ALLOW_DATA_ATTR — new RegExp attributes need a real translation.
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
}
