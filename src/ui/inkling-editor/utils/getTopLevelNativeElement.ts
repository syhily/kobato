export function getTopLevelNativeElement(node: Node | null): Element | null {
  if (!node) {
    return null
  }
  let target: Element | null = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)

  if (!target) {
    return null
  }

  const selector = '[data-lexical-editor] > *'
  return target.closest(selector)
}
