import { strategyToConfig } from '@kobato/shared/sanitize-html-config'

// Client-side sanitizer for the decorator nodes' `exportDOM` markup
// (KaTeX MathML / legacy SVG). Shared must stay isomorphic: the walker
// touches the DOM only when invoked, and `exportDOM` runs in the editor
// (browser) only — headless / SSR contexts never reach this path and
// return the input untouched.
//
// The implementation is a small allowlist walker over the `'math'`
// strategy of `sanitize-html-config` (the SAME tags/attributes/schemes
// the node engine's sanitize-html and the editor's DOMPurify engine
// used), because the two dependency-grade engines are not viable here:
// sanitize-html is Node-only (banned from client bundles), and DOMPurify
// strips the `<math>` element when the host parser does not implement
// foreign-content namespaces (happy-dom in tests) while keeping it under
// spec-compliant parsers — an environment-dependent output. The walker
// emits the same allowlisted markup in every DOM (happy-dom / jsdom /
// browsers): disallowed tags are removed, attributes filtered to the
// allowlist, and `href`/`src` values gated by the engine's scheme regex.
// This matches the historical sanitize-html output for the MathML shapes
// KaTeX produces (sanitize-html also strips the un-allowlisted legacy
// `<svg>` fallback, keeping only text content).
//
// Note: the walker is defense-in-depth on server-rendered KaTeX output,
// not a general HTML sanitizer — the allowlist is deliberately closed
// (no `script`/`style`/event handlers/`style` attributes).

const ALLOWED_URI = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i

export function sanitizeMathMarkup(html: string): string {
  if (typeof document === 'undefined') {
    return html
  }
  const config = strategyToConfig('math')
  const allowedTags = new Set(config.tags)
  const allowedAttrs = new Set<string>()
  for (const attr of config.attributes) {
    if (typeof attr === 'string') {
      allowedAttrs.add(attr.toLowerCase())
    }
  }
  const allowDataAttrs = config.attributes.some((attr) => attr instanceof RegExp)

  const template = document.createElement('template')
  template.innerHTML = html

  const scrub = (element: Element): void => {
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase()
      const isDataAttr = allowDataAttrs && name.startsWith('data-')
      if (!allowedAttrs.has(name) && !isDataAttr) {
        element.removeAttribute(attr.name)
        continue
      }
      if ((name === 'href' || name === 'src') && !ALLOWED_URI.test(attr.value)) {
        element.removeAttribute(attr.name)
      }
    }
    for (const child of Array.from(element.children)) {
      if (!allowedTags.has(child.tagName.toLowerCase())) {
        child.remove()
      } else {
        scrub(child)
      }
    }
  }

  for (const child of Array.from(template.content.children)) {
    if (!allowedTags.has(child.tagName.toLowerCase())) {
      child.remove()
    } else {
      scrub(child)
    }
  }
  return template.innerHTML
}
