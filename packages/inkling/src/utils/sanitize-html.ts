import DOMPurify, { type WindowLike } from 'dompurify'

import type { ExportDOMDom } from '@/nodes/base/export-dom'

export interface SanitizeHtmlOptions {
  replaceJS?: boolean
}

type SanitizeWindow = ExportDOMDom['window']

function parseHtml(html: string, window?: SanitizeWindow): Document {
  if (window) {
    // The provided window's own DOMParser — same full-document parse entry
    // as the browser default, so the pinned parsing behavior (a standalone
    // leading <script> lands in <head>) is preserved while no global is
    // touched. The structural window-to-WindowLike assertion stays inside
    // this policy module.
    return new (window as unknown as WindowLike).DOMParser().parseFromString(html, 'text/html')
  }

  return new DOMParser().parseFromString(html, 'text/html')
}

function replaceScriptAndIframePlaceholders(html: string, window?: SanitizeWindow): string {
  const doc = parseHtml(html, window)

  const disallowedElements = doc.querySelectorAll('script, iframe')
  if (disallowedElements.length === 0) {
    return html
  }

  disallowedElements.forEach((element) => {
    const placeholder = doc.createElement('pre')
    if (element.tagName.toLowerCase() === 'script') {
      placeholder.setAttribute('class', 'js-embed-placeholder')
      placeholder.textContent = 'Embedded JavaScript'
    } else {
      placeholder.setAttribute('class', 'iframe-embed-placeholder')
      placeholder.textContent = 'Embedded iFrame'
    }
    element.replaceWith(placeholder)
  })

  return doc.body.innerHTML
}

/**
 * The optional `window` port binds parsing and DOMPurify to a specific
 * window so the function never touches browser globals — headless renders
 * pass their resolved window through the render context. Omitted, the
 * browser-global defaults apply (the live-editor call sites).
 */
export function sanitizeHtml(html = '', options: SanitizeHtmlOptions = {}, window?: SanitizeWindow): string {
  const resolvedOptions = {
    replaceJS: true,
    ...options,
  }

  let result = html

  if (resolvedOptions.replaceJS) {
    result = replaceScriptAndIframePlaceholders(html, window)
  }

  const purify = window ? DOMPurify(window as unknown as WindowLike) : DOMPurify

  return purify.sanitize(result, {
    ALLOWED_URI_REGEXP: /^(?:https?:|\/|blob:)/,
    ADD_ATTR: ['id'],
    FORBID_TAGS: ['style'],
  })
}
