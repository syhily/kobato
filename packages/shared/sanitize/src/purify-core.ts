import type { SanitizeStrategyConfig } from '@kobato/sanitize/config'
import type createDOMPurify from 'dompurify'

type Purify = ReturnType<typeof createDOMPurify>

const ALLOWED_URI = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i

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
      const hasDataAttr = config.attributes.some((attr) => attr instanceof RegExp)
      const allowedAttr = [
        ...config.attributes.filter((attr): attr is string => typeof attr === 'string'),
        ...Object.values(config.tagAttributes ?? {}).flat(),
      ]
      return purify.sanitize(html, {
        ALLOWED_TAGS: [...config.tags],
        ALLOWED_ATTR: allowedAttr,
        ALLOWED_URI_REGEXP: config.noProtocolRelative === true ? ALLOWED_URI_NO_PROTOCOL_RELATIVE : ALLOWED_URI,
        ALLOW_DATA_ATTR: hasDataAttr,
      })
    } finally {
      activeStyles = undefined
      activeAttributes = undefined
      activeTagAttributes = undefined
      activeNoopenerOnBlankTarget = false
    }
  }
}
