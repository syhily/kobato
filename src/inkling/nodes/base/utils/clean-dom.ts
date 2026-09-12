import type { RenderContext } from '@/inkling/nodes/base/render-context'

// Attributes the nested callout editor legitimately produces. A[href] is
// additionally validated with the render context's URL policy; CODE[style]
// is constrained to Lexical's known inline-code serialization.
const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  A: ['href', 'rel', 'target'],
  CODE: ['spellcheck', 'style'],
}
const CODE_STYLE_REGEX = /^white-space:\s*pre-wrap;?$/

function cleanAttributes(element: Element, allowedAttributes: Record<string, string[]>, context: RenderContext) {
  const allowed = allowedAttributes[element.tagName] ?? []

  // snapshot the live NamedNodeMap since attributes are removed while iterating
  for (const attribute of Array.from(element.attributes)) {
    if (!allowed.includes(attribute.name)) {
      element.removeAttribute(attribute.name)
      continue
    }

    if (element.tagName === 'A' && attribute.name === 'href' && context.safeUrl('navigation', attribute.value) === '') {
      element.removeAttribute(attribute.name)
    }

    if (element.tagName === 'CODE' && attribute.name === 'style' && !CODE_STYLE_REGEX.test(attribute.value.trim())) {
      element.removeAttribute(attribute.name)
    }
  }
}

// nodeType, not instanceof: the cleaned document may be another jsdom
// realm's, where instanceof fails. nodeType 1 (ELEMENT_NODE) is realm-proof
// and genuinely discriminates — every node with nodeType 1 IS an Element.
function isElementNode(node: ChildNode): node is Element {
  return node.nodeType === 1
}

export function cleanDOM(
  node: Element,
  allowedTags: string[],
  context: RenderContext,
  allowedAttributes: Record<string, string[]> = ALLOWED_ATTRIBUTES,
) {
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i]
    if (!isElementNode(child)) {
      continue
    }
    if (!allowedTags.includes(child.tagName)) {
      while (child.firstChild) {
        node.insertBefore(child.firstChild, child)
      }
      node.removeChild(child)
      i -= 1
    } else {
      cleanAttributes(child, allowedAttributes, context)
      cleanDOM(child, allowedTags, context, allowedAttributes)
    }
  }
}
