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
      (typeof DOMParser !== 'undefined' && DOMParser) || (typeof window !== 'undefined' && window.DOMParser)

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

  // remove any elements that have a blank textContent
  if (cleanHtml) {
    const doc = resolvedOptions.createDocument(cleanHtml)

    // don't analyze the document if it's empty (can result in storing <br> tags if allowed)
    if (doc.body.textContent === '') {
      return ''
    }

    doc.body.querySelectorAll('*').forEach((element) => {
      // Treat Zero Width Non-Joiner characters as spaces
      if (!element.textContent?.trim().replace(/\u200c+/g, '')) {
        if (resolvedOptions.allowBr && element.tagName === 'BR') {
          // keep it
          return
        }
        if (resolvedOptions.allowBr && element.querySelector('br')) {
          return element.replaceWith(doc.createElement('br'))
        }
        if (element.textContent && element.textContent.length > 0) {
          // keep a single space to avoid collapsing spaces
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
