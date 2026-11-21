import { useEffect } from 'react'

function isPublicStylesheet(el: Element): boolean {
  if (el.tagName === 'STYLE') {
    const devId = el.getAttribute('data-vite-dev-id') ?? ''
    return /[/\\]public\.css(?:[?#]|$)/.test(devId)
  }
  if (el instanceof HTMLLinkElement) {
    const href = el.getAttribute('href') ?? ''
    return /(?:\/|^)public(?:\.|-)[^/]*\.css(?:[?#]|$)/.test(href)
  }
  return false
}

export function useDetachPublicCss(): void {
  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }
    type Detached = { node: Element; nextSibling: Node | null; parent: ParentNode }
    const detached: Detached[] = []
    document.head.querySelectorAll('style, link[rel="stylesheet"]').forEach((el) => {
      if (!isPublicStylesheet(el)) {
        return
      }
      const parent = el.parentNode
      if (!parent) {
        return
      }
      detached.push({ node: el, nextSibling: el.nextSibling, parent })
      el.remove()
    })
    return () => {
      for (const { node, nextSibling, parent } of detached) {
        if (node.parentNode !== null) {
          continue
        }
        try {
          if (nextSibling?.parentNode === parent) {
            parent.insertBefore(node, nextSibling)
          } else {
            parent.appendChild(node)
          }
        } catch {}
      }
    }
  }, [])
}
