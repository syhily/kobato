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
  } else if (element.dataset?.width) {
    const width = parseInt(element.dataset.width, 10)
    if (!Number.isNaN(width)) {
      attrs.width = width
    }
  }

  if (element.height) {
    attrs.height = element.height
  } else if (element.dataset?.height) {
    const height = parseInt(element.dataset.height, 10)
    if (!Number.isNaN(height)) {
      attrs.height = height
    }
  }

  if (!element.width && !element.height) {
    const dimensions = element.getAttribute('data-image-dimensions')
    if (dimensions) {
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

  const parent = element.parentElement
  if (parent?.tagName === 'A' && 'href' in parent && typeof parent.href === 'string') {
    const href = parent.href

    if (href !== attrs.src) {
      attrs.href = href
    }
  }

  return attrs
}
