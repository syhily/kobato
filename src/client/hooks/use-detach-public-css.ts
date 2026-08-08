import { useEffect } from 'react'

// React Router keeps injected CSS in `<head>` across SPA navigations, and
// `public.css`'s un-layered rules beat any `@layer utilities` rule. Detach
// public stylesheets on mount, re-attach on unmount. Every layout that opts
// out of public chrome must also opt into this hook.

function isPublicStylesheet(el: Element): boolean {
  if (el.tagName === 'STYLE') {
    // Vite dev server injects `<style data-vite-dev-id="…/public.css">`
    const devId = el.getAttribute('data-vite-dev-id') ?? ''
    return /[/\\]public\.css(?:[?#]|$)/.test(devId)
  }
  if (el instanceof HTMLLinkElement) {
    // Production build emits a hashed `<link rel="stylesheet" href="…/assets/public-XXXX.css">`.
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
        // Re-anchor only when the original position is still valid; skip if re-attached elsewhere.
        if (node.parentNode !== null) {
          continue
        }
        try {
          if (nextSibling !== null && nextSibling.parentNode === parent) {
            parent.insertBefore(node, nextSibling)
          } else {
            parent.appendChild(node)
          }
        } catch {
          // ignore — re-attachment is best-effort.
        }
      }
    }
  }, [])
}
