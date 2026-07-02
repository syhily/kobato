import DOMPurify from 'dompurify'

export interface SanitizeHtmlOptions {
  replaceJS?: boolean
}

export function sanitizeHtml(html = '', options: SanitizeHtmlOptions = {}): string {
  const resolvedOptions = {
    replaceJS: true,
    ...options,
  }

  let result = html

  // replace script and iFrame
  if (resolvedOptions.replaceJS) {
    result = result.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      '<pre class="js-embed-placeholder">Embedded JavaScript</pre>',
    )
    result = result.replace(
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      '<pre class="iframe-embed-placeholder">Embedded iFrame</pre>',
    )
  }

  // sanitize html
  return DOMPurify.sanitize(result, {
    ALLOWED_URI_REGEXP: /^(?:https?:|\/|blob:)/,
    ADD_ATTR: ['id'],
    FORBID_TAGS: ['style'],
  }) as string
}
