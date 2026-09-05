export function getTopLevelNativeElement(node: Node | null): Element | null {
  if (!node) {
    return null
  }
  const target = node instanceof Element ? node : node.parentElement

  if (!target) {
    return null
  }

  const selector = '[data-lexical-editor] > *'
  return target.closest(selector)
}
