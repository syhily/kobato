import { createTestDom } from '#/utils/render-live'
import { cleanBasicHtml } from '@/html/clean-basic-html/clean-basic-html'

describe('cleanBasicHtml', function () {
  let options: { createDocument: (html: string) => Document }

  beforeAll(function () {
    options = {
      createDocument(html: string) {
        return createTestDom(html).window.document
      },
    }
  })

  it('errors in Node.js env without a `createDocument` option', function () {
    // simulate a non-browser environment: no DOMParser on the global scope
    vi.stubGlobal('DOMParser', undefined)
    vi.stubGlobal('window', undefined)
    try {
      expect(function () {
        cleanBasicHtml('Test')
      }).toThrow(
        /^cleanBasicHtml\(\) must be passed a `createDocument` function as an option when used in a non-browser environment$/,
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('trims all variants of whitespace', function () {
    const html = '  <br>&nbsp;&nbsp; &nbsp;'
    const result = cleanBasicHtml(html, options)

    expect(result).toBe('')
  })

  it('trims trailing non-breaking space entities', function () {
    const html = 'Hello&nbsp;'
    const result = cleanBasicHtml(html, options)

    expect(result).toBe('Hello')
  })

  it('keeps whitespace between text', function () {
    const html = '&nbsp; <br>Testing &nbsp;Significant Whitespace<br />&nbsp;'
    const result = cleanBasicHtml(html, options)

    expect(result).toBe('Testing Significant Whitespace')
  })

  it('removes DOM elements with blank text content', function () {
    const html = '&nbsp; <p> &nbsp;&nbsp;<br></p>'
    const result = cleanBasicHtml(html, options)

    expect(result).toBe('')
  })

  it('keeps elements with text content', function () {
    const html = ' &nbsp;<strong> Test&nbsp;</strong> '
    const result = cleanBasicHtml(html, options)

    expect(result).toBe('<strong> Test&nbsp;</strong>')
  })

  it('can extract first element content', function () {
    const html = '<p><span>Headline</span> <em>italic</em></p>'
    const result = cleanBasicHtml(html, { ...options, firstChildInnerContent: true })

    expect(result).toBe('<span>Headline</span> <em>italic</em>')
  })

  it('return empty string if firstChildInnerContent option enabled and there is no first child element ', function () {
    const html = ''
    const result = cleanBasicHtml(html, { ...options, firstChildInnerContent: true })

    expect(result).toBe('')
  })
})

describe('options.ownerDocument', function () {
  it('parses within the given document (the headless-import port)', function () {
    const element = document.createElement('div')
    const result = cleanBasicHtml('<p>caption <b>text</b></p>', { ownerDocument: element.ownerDocument })
    expect(result).toBe('<p>caption <b>text</b></p>')
  })

  it('an explicit createDocument wins over ownerDocument', function () {
    const element = document.createElement('div')
    const result = cleanBasicHtml('<p>x</p>', {
      ownerDocument: element.ownerDocument,
      createDocument: (html) => new DOMParser().parseFromString(`<span>custom</span>${html}`, 'text/html'),
    })
    expect(result).toBe('<span>custom</span><p>x</p>')
  })
})
