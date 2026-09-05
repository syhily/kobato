import type createDOMPurify from 'dompurify'

import type { SanitizeStrategyConfig } from '@/shared/sanitize/config'

// Shared DOMPurify core for both sanitize engines. The engine files differ
// only in WHERE the DOM comes from (browser global vs a process-cached
// jsdom); every behavioral rule lives here once so the SSR bytes and the
// hydration bytes can never drift apart (R16h/R16i: the previous
// sanitize-html/DOMPurify pair diverged byte-wise on 859/9031 dev-DB rows).

type Purify = ReturnType<typeof createDOMPurify>

// Mirrors the old sanitize-html allowedSchemes: http/https/mailto +
// protocol-relative and relative URLs.
const ALLOWED_URI = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i

// Stricter variant for configs with `noProtocolRelative` (sanitize-html's
// `allowProtocolRelative: false`): same shape plus a `(?!\/\/)` lookahead.
const ALLOWED_URI_NO_PROTOCOL_RELATIVE = /^(?!\/\/)(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i

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

function isGloballyAllowedAttribute(attrName: string, attributes: readonly (string | RegExp)[]): boolean {
  return attributes.some((attr) => (typeof attr === 'string' ? attr === attrName : attr.test(attrName)))
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
  let activeAttributes: readonly (string | RegExp)[] | undefined
  let activeTagAttributes: Readonly<Record<string, readonly string[]>> | undefined
  let activeNoopenerOnBlankTarget = false

  purify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'style' && activeStyles !== undefined) {
      const filtered = filterStyleAttribute(data.attrValue, activeStyles)
      if (filtered === '') {
        node.removeAttribute('style')
        return
      }
      data.attrValue = filtered
      return
    }
    // Per-tag narrowing: ALLOWED_ATTR carries the global ∪ per-tag union (a
    // per-tag attribute must be in ALLOWED_ATTR to reach this hook at all),
    // so attributes allowed only via `tagAttributes` are dropped again here
    // on every tag but their own.
    if (activeTagAttributes === undefined || activeAttributes === undefined) {
      return
    }
    if (isGloballyAllowedAttribute(data.attrName, activeAttributes)) {
      return
    }
    const perTag = activeTagAttributes[node.tagName.toLowerCase()]
    if (perTag === undefined || !perTag.includes(data.attrName)) {
      data.keepAttr = false
    }
  })

  purify.addHook('afterSanitizeAttributes', (node) => {
    // sanitize-html transformTags parity: overwrite the whole rel value.
    if (activeNoopenerOnBlankTarget && node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer nofollow')
    }
  })

  return (html, config) => {
    activeStyles = config.styles
    activeAttributes = config.attributes
    activeTagAttributes = config.tagAttributes
    activeNoopenerOnBlankTarget = config.noopenerOnBlankTarget === true
    try {
      // ALLOWED_ATTR is string-only; the /^data-.*$/ RegExp maps to
      // ALLOW_DATA_ATTR — new RegExp attributes need a real translation.
      const hasDataAttr = config.attributes.some((attr) => attr instanceof RegExp)
      const allowedAttr = [
        ...config.attributes.filter((attr): attr is string => typeof attr === 'string'),
        ...Object.values(config.tagAttributes ?? {}).flat(),
      ]
      return purify.sanitize(html, {
        ALLOWED_TAGS: [...config.tags],
        ALLOWED_ATTR: allowedAttr,
        ALLOWED_URI_REGEXP: config.noProtocolRelative === true ? ALLOWED_URI_NO_PROTOCOL_RELATIVE : ALLOWED_URI,
        ...(hasDataAttr ? { ALLOW_DATA_ATTR: true } : {}),
      })
    } finally {
      activeStyles = undefined
      activeAttributes = undefined
      activeTagAttributes = undefined
      activeNoopenerOnBlankTarget = false
    }
  }
}
