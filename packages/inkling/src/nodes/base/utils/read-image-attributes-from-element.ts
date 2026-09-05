// tagName rather than instanceof: the imported document can come from another
// realm (a separate JSDOM in tests), where the global HTMLImageElement
// wouldn't match
const isImageElement = (element: Element): element is HTMLImageElement => element.tagName === 'IMG'

export function readImageAttributesFromElement(element: Element): Record<string, string | number> {
  const attrs: Record<string, string | number> = {}

  if (!isImageElement(element)) {
    return attrs
  }

  if (element.src) {
    attrs.src = element.src
  }

  if (element.width) {
    attrs.width = element.width
  } else if (element.dataset && element.dataset.width) {
    // garbage data-width values must not surface as NaN — the
    // data-image-dimensions path below enforces the same no-NaN rule
    const width = parseInt(element.dataset.width, 10)
    if (!Number.isNaN(width)) {
      attrs.width = width
    }
  }

  if (element.height) {
    attrs.height = element.height
  } else if (element.dataset && element.dataset.height) {
    const height = parseInt(element.dataset.height, 10)
    if (!Number.isNaN(height)) {
      attrs.height = height
    }
  }

  if (!element.width && !element.height) {
    const dimensions = element.getAttribute('data-image-dimensions')
    if (dimensions) {
      // both capture groups must carry digits — /^(\d*)x(\d*)$/ matched
      // inputs like 'x' or '640x' and stored NaN widths/heights
      const match = /^(\d+)x(\d+)$/gi.exec(dimensions)
      if (match) {
        const [, width, height] = match
        attrs.width = parseInt(width, 10)
        attrs.height = parseInt(height, 10)
      }
    }
  }

  if (element.alt) {
    attrs.alt = element.alt
  }

  if (element.title) {
    attrs.title = element.title
  }

  // tagName rather than instanceof: the imported document can come from
  // another realm (a separate JSDOM in tests), where the global
  // HTMLAnchorElement wouldn't match; the `in` + typeof checks then prove
  // the href property without a cast
  const parent = element.parentElement
  if (parent?.tagName === 'A' && 'href' in parent && typeof parent.href === 'string') {
    const href = parent.href

    if (href !== attrs.src) {
      attrs.href = href
    }
  }

  return attrs
}
