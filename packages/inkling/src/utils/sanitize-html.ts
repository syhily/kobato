import type { ExportDOMDom } from '@kobato/inkling-internal/nodes/base/export-dom'

import DOMPurify, { type WindowLike } from 'dompurify'

export interface SanitizeHtmlOptions {
  replaceJS?: boolean
}

type SanitizeWindow = ExportDOMDom['window']

function isWindowLike(window: SanitizeWindow): window is SanitizeWindow & WindowLike {
  return 'DOMParser' in window && typeof window.DOMParser === 'function'
}

function requireWindowLike(window: SanitizeWindow): SanitizeWindow & WindowLike {
  if (!isWindowLike(window)) {
    throw new TypeError('sanitizeHtml: the provided window does not expose DOMParser')
  }
  return window
}

function parseHtml(html: string, window?: SanitizeWindow): Document {
  if (window) {
    const windowLike = requireWindowLike(window)
    return new windowLike.DOMParser().parseFromString(html, 'text/html')
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

export function sanitizeHtml(html = '', options: SanitizeHtmlOptions = {}, window?: SanitizeWindow): string {
  const resolvedOptions = {
    replaceJS: true,
    ...options,
  }

  let result = html

  if (resolvedOptions.replaceJS) {
    result = replaceScriptAndIframePlaceholders(html, window)
  }

  const purify = window ? DOMPurify(requireWindowLike(window)) : DOMPurify

  return purify.sanitize(result, {
    ALLOWED_URI_REGEXP: /^(?:https?:|\/|blob:)/,
    ADD_ATTR: ['id'],
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'],
  })
}
