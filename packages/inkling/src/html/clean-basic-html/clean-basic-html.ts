export interface CleanBasicHtmlOptions {
  allowBr?: boolean
  firstChildInnerContent?: boolean
  createDocument?: (html: string) => Document
  /** Parse within this document (an element's `ownerDocument`) — the port that makes headless jsdom import work. */
  ownerDocument?: Document
}

export function cleanBasicHtml(html: string = '', options: CleanBasicHtmlOptions = {}): string {
  const resolvedOptions: CleanBasicHtmlOptions = { ...options }

  if (!resolvedOptions.createDocument && resolvedOptions.ownerDocument) {
    const ownerDocument = resolvedOptions.ownerDocument
    resolvedOptions.createDocument = (docHtml: string): Document => {
      const newDoc = ownerDocument.implementation.createHTMLDocument()
      newDoc.body.innerHTML = docHtml
      return newDoc
    }
  }

  if (!resolvedOptions.createDocument) {
    const Parser =
      (typeof DOMParser === 'undefined' ? undefined : DOMParser) ??
      (typeof window === 'undefined' ? undefined : window.DOMParser)

    if (!Parser) {
      throw new Error(
        'cleanBasicHtml() must be passed a `createDocument` function as an option when used in a non-browser environment',
      )
    }

    resolvedOptions.createDocument = function (docHtml: string): Document {
      const parser = new Parser()
      return parser.parseFromString(docHtml, 'text/html')
    }
  }

  let cleanHtml: string = html

  if (!resolvedOptions.allowBr || cleanHtml === '<br>') {
    cleanHtml = cleanHtml.replace(/<br\s?\/?>/g, ' ')
  }

  cleanHtml = cleanHtml
    .replace(/(\s|&nbsp;){2,}/g, ' ')
    .trim()
    .replace(/^&nbsp;|&nbsp;$/g, '')
    .trim()

  if (cleanHtml) {
    const doc = resolvedOptions.createDocument(cleanHtml)

    if (doc.body.textContent === '') {
      return ''
    }

    doc.body.querySelectorAll('*').forEach((element) => {
      if (!element.textContent?.trim().replace(/\u200c+/g, '')) {
        if (resolvedOptions.allowBr && element.tagName === 'BR') {
          return
        }
        if (resolvedOptions.allowBr && element.querySelector('br')) {
          return element.replaceWith(doc.createElement('br'))
        }
        if (element.textContent && element.textContent.length > 0) {
          const space = doc.createTextNode(' ')
          return element.replaceWith(space)
        }
        return element.remove()
      }
    })

    if (resolvedOptions.firstChildInnerContent && doc.body.firstElementChild) {
      cleanHtml = doc.body.firstElementChild.innerHTML.trim()
    } else {
      cleanHtml = doc.body.innerHTML.trim()
    }
  }

  return cleanHtml
}
