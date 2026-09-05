import type { SerializedEditorState, SerializedElementNode } from 'lexical'

import assert from 'node:assert/strict'

import { htmlToLexical as importWithDom } from '#/utils/html-to-lexical-with-dom'

const options = {
  editorConfig: {
    onError(e: Error) {
      throw e
    },
  },
}

// Serialized Lexical JSON nodes have varying shapes depending on node type.
// Extend SerializedElementNode with recursive children and an index signature
// for type-specific properties (tag, listType, url, src, text) from subclasses.
interface NodeJSON extends SerializedElementNode<NodeJSON> {
  [key: string]: unknown
}

function htmlToLexical(html: string, opts?: Parameters<typeof importWithDom>[1]): SerializedEditorState<NodeJSON> {
  return importWithDom(html, opts) as SerializedEditorState<NodeJSON>
}

describe('HTMLtoLexical', function () {
  describe('Minimal examples', function () {
    it('can convert empty document', function () {
      const lexical = htmlToLexical('', options)

      assert.deepEqual(lexical, {
        root: {
          children: [
            {
              children: [],
              direction: null,
              format: '',
              indent: 0,
              textFormat: 0,
              textStyle: '',
              type: 'paragraph',
              version: 1,
            },
          ],
          direction: null,
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
        },
      })
    })

    it('can convert null document', function () {
      const lexical = htmlToLexical(null as unknown as string, options)

      assert.deepEqual(lexical, {
        root: {
          children: [
            {
              children: [],
              direction: null,
              format: '',
              indent: 0,
              textFormat: 0,
              textStyle: '',
              type: 'paragraph',
              version: 1,
            },
          ],
          direction: null,
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
        },
      })
    })

    it('can convert whitespace-only document', function () {
      const lexical = htmlToLexical('   \n\t  ', options)

      // whitespace-only HTML must follow the same MINIMAL_DOCUMENT path as an empty import
      assert.deepEqual(lexical, htmlToLexical('', options))
    })

    it('can convert without options', function () {
      const lexical = htmlToLexical('<p>Hello World</p>')

      assert.deepEqual(lexical, {
        root: {
          children: [
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text: 'Hello World',
                  type: 'extended-text',
                  version: 1,
                },
              ],
              direction: null,
              format: '',
              indent: 0,
              textFormat: 0,
              textStyle: '',
              type: 'paragraph',
              version: 1,
            },
          ],
          direction: null,
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
        },
      })
    })

    it('can convert <p>Hello World</p>', function () {
      const lexical = htmlToLexical('<p>Hello World</p>', options)

      assert.deepEqual(lexical, {
        root: {
          children: [
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text: 'Hello World',
                  type: 'extended-text',
                  version: 1,
                },
              ],
              direction: null,
              format: '',
              indent: 0,
              textFormat: 0,
              textStyle: '',
              type: 'paragraph',
              version: 1,
            },
          ],
          direction: null,
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
        },
      })
    })

    it('can convert <p>Hello</p><p>World</p>', function () {
      const lexical = htmlToLexical('<p>Hello</p><p>World</p>', options)

      assert.deepEqual(lexical, {
        root: {
          children: [
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text: 'Hello',
                  type: 'extended-text',
                  version: 1,
                },
              ],
              direction: null,
              format: '',
              indent: 0,
              textFormat: 0,
              textStyle: '',
              type: 'paragraph',
              version: 1,
            },
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text: 'World',
                  type: 'extended-text',
                  version: 1,
                },
              ],
              direction: null,
              format: '',
              indent: 0,
              textFormat: 0,
              textStyle: '',
              type: 'paragraph',
              version: 1,
            },
          ],
          direction: null,
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
        },
      })
    })
  })

  describe('Alignment', function () {
    const alignedParagraph = (format: string) => ({
      root: {
        children: [
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'Hello World',
                type: 'extended-text',
                version: 1,
              },
            ],
            direction: null,
            format,
            indent: 0,
            textFormat: 0,
            textStyle: '',
            type: 'paragraph',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    })

    it('strips imported text-align by default', function () {
      const lexical = htmlToLexical('<p style="text-align: center">Hello World</p>', options)

      assert.deepEqual(lexical, alignedParagraph(''))
    })

    it('strips imported text-align with explicit alignment: strip', function () {
      const lexical = htmlToLexical('<p style="text-align: center">Hello World</p>', { ...options, alignment: 'strip' })

      assert.deepEqual(lexical, alignedParagraph(''))
    })

    it('keeps imported text-align with alignment: keep', function () {
      const lexical = htmlToLexical('<p style="text-align: center">Hello World</p>', { ...options, alignment: 'keep' })

      assert.deepEqual(lexical, alignedParagraph('center'))
    })
  })

  describe('Nested examples', function () {
    const helloWorldDoc = {
      root: {
        children: [
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'Hello',
                type: 'extended-text',
                version: 1,
              },
            ],
            direction: null,
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            type: 'paragraph',
            version: 1,
          },
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'World',
                type: 'extended-text',
                version: 1,
              },
            ],
            direction: null,
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
            type: 'paragraph',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    it('can convert <div><p>Hello</p><p>World</p></div>', function () {
      const lexical = htmlToLexical('<div><p>Hello</p><p>World</p></div>', options)
      assert.deepEqual(lexical, helloWorldDoc)
    })

    it('can convert <div><div><p>Hello</p><p>World</p></div></div>', function () {
      const lexical = htmlToLexical('<div><div><p>Hello</p><p>World</p></div></div>', options)
      assert.deepEqual(lexical, helloWorldDoc)
    })

    it('can convert <div><section><p>Hello</p></section><div><p>World</p></div></div>', function () {
      const lexical = htmlToLexical('<div><section><p>Hello</p></section><div><p>World</p></div></div>', options)
      assert.deepEqual(lexical, helloWorldDoc)
    })

    it('can convert <div><p>Hello</p><div><p>World</p></div></div>', function () {
      const lexical = htmlToLexical('<div><p>Hello</p><div><p>World</p></div></div>', options)
      assert.deepEqual(lexical, helloWorldDoc)
    })

    it('can convert with whitespace', function () {
      const lexical = htmlToLexical(
        `
                <div>
                    <p>Hello</p>
                    <div>
                        <p>World</p>
                    </div>
                </div>
            `,
        options,
      )

      assert.deepEqual(lexical, helloWorldDoc)
    })

    it('avoids invalid nesting of image nodes', function () {
      const lexical = htmlToLexical(
        `
                <p>Hello</p>
                <p><img src="https://world.com" width="100" height="100"></p>
            `,
        options,
      )

      assert.deepEqual(lexical, {
        root: {
          children: [
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text: 'Hello',
                  type: 'extended-text',
                  version: 1,
                },
              ],
              direction: null,
              format: '',
              indent: 0,
              textFormat: 0,
              textStyle: '',
              type: 'paragraph',
              version: 1,
            },
            {
              type: 'image',
              version: 1,
              src: 'https://world.com/',
              width: 100,
              height: 100,
              title: '',
              alt: '',
              caption: '',
              cardWidth: 'regular',
              href: '',
            },
          ],
          direction: null,
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
        },
      })
    })

    it('avoids invalid nesting of header nodes', function () {
      // Google Docs uses spans for headings
      const lexical = htmlToLexical(
        `
                <h1><span style="font-size: 26pt">Hello</span></h1>
                <p><span style="font-size: 26pt">World</span></p>
            `,
        options,
      )

      assert.deepEqual(lexical, {
        root: {
          children: [
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text: 'Hello',
                  type: 'extended-text',
                  version: 1,
                },
              ],
              direction: null,
              format: '',
              indent: 0,
              tag: 'h1',
              type: 'extended-heading',
              version: 1,
            },
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text: 'World',
                  type: 'extended-text',
                  version: 1,
                },
              ],
              direction: null,
              format: '',
              indent: 0,
              tag: 'h1',
              type: 'extended-heading',
              version: 1,
            },
          ],
          direction: null,
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
        },
      })
    })
  })

  describe('HTML nodes', function () {
    it('can convert headings', function () {
      const lexical = htmlToLexical('<h1>Hello World</h1>', options)

      assert.ok(lexical.root)
      assert.equal(lexical.root.children.length, 1)
      assert.equal(lexical.root.children[0].type, 'extended-heading')
      assert.equal(lexical.root.children[0].tag, 'h1')
      assert.equal(lexical.root.children[0].children.length, 1)
      assert.equal(lexical.root.children[0].children[0].text, 'Hello World')
    })

    it('can convert links', function () {
      const lexical = htmlToLexical('<a href="https://example.com">Hello World</a>', options)

      assert.ok(lexical.root)
      assert.equal(lexical.root.children.length, 1)
      assert.equal(lexical.root.children[0].type, 'paragraph')
      assert.equal(lexical.root.children[0].children.length, 1)
      assert.equal(lexical.root.children[0].children[0].type, 'link')
      assert.equal(lexical.root.children[0].children[0].url, 'https://example.com')
      assert.equal(lexical.root.children[0].children[0].children.length, 1)
      assert.equal(lexical.root.children[0].children[0].children[0].text, 'Hello World')
    })

    it('can convert lists', function () {
      const lexical = htmlToLexical('<ul><li>Hello</li><li>World</li></ul>', options)

      assert.ok(lexical.root)
      assert.equal(lexical.root.children.length, 1)
      assert.equal(lexical.root.children[0].type, 'list')
      assert.equal(lexical.root.children[0].listType, 'bullet')
      assert.equal(lexical.root.children[0].children.length, 2)
      assert.equal(lexical.root.children[0].children[0].type, 'listitem')
      assert.equal(lexical.root.children[0].children[0].children.length, 1)
      assert.equal(lexical.root.children[0].children[0].children[0].text, 'Hello')
      assert.equal(lexical.root.children[0].children[1].type, 'listitem')
      assert.equal(lexical.root.children[0].children[1].children.length, 1)
      assert.equal(lexical.root.children[0].children[1].children[0].text, 'World')
    })

    it('can convert list items with nested paragraph', function () {
      const lexical = htmlToLexical('<ul><li><p>Hello</p></li><li><p>World</p></li></ul>', options)

      assert.ok(lexical.root)
      assert.equal(lexical.root.children.length, 1)
      assert.equal(lexical.root.children[0].type, 'list')
      assert.equal(lexical.root.children[0].listType, 'bullet')
      assert.equal(lexical.root.children[0].children.length, 2)
      assert.equal(lexical.root.children[0].children[0].type, 'listitem')
      assert.equal(lexical.root.children[0].children[0].children.length, 1)
      assert.equal(lexical.root.children[0].children[0].children[0].text, 'Hello')
      assert.equal(lexical.root.children[0].children[1].type, 'listitem')
      assert.equal(lexical.root.children[0].children[1].children.length, 1)
      assert.equal(lexical.root.children[0].children[1].children[0].text, 'World')
    })

    it('can convert blockquotes', function () {
      const lexical = htmlToLexical('<blockquote>Hello World</blockquote>', options)

      assert.ok(lexical.root)
      assert.equal(lexical.root.children.length, 1)
      assert.equal(lexical.root.children[0].type, 'extended-quote')
      assert.equal(lexical.root.children[0].children.length, 1)
      assert.equal(lexical.root.children[0].children[0].text, 'Hello World')
    })

    it('can convert blockquote with nested paragraph', function () {
      const lexical = htmlToLexical('<blockquote><p>Hello World</p></blockquote>', options)

      assert.ok(lexical.root)
      assert.equal(lexical.root.children.length, 1)
      assert.equal(lexical.root.children[0].type, 'extended-quote')
      assert.equal(lexical.root.children[0].children.length, 1)
      assert.equal(lexical.root.children[0].children[0].text, 'Hello World')
    })

    it('can convert blockquote with nested paragraphs (paragraphs separated by line breaks)', function () {
      const lexical = htmlToLexical('<blockquote><p>Hello</p><p>World</p></blockquote>', options)

      assert.ok(lexical.root)
      assert.equal(lexical.root.children.length, 1)
      assert.equal(lexical.root.children[0].type, 'extended-quote')
      assert.equal(lexical.root.children[0].children.length, 6)
      assert.equal(lexical.root.children[0].children[0].text, 'Hello')
      assert.equal(lexical.root.children[0].children[1].type, 'linebreak')
      assert.equal(lexical.root.children[0].children[2].type, 'linebreak')
      assert.equal(lexical.root.children[0].children[3].type, 'linebreak')
      assert.equal(lexical.root.children[0].children[4].type, 'linebreak')
      assert.equal(lexical.root.children[0].children[5].text, 'World')
    })
  })

  describe('Custom nodes', function () {
    it('can convert <hr> into a card', function () {
      // $insertNodes() doesn't work with just decorators, uses $appendNodes() instead
      const lexical = htmlToLexical('<hr>', options)

      assert.ok(lexical.root)
      assert.equal(lexical.root.children.length, 1)
      assert.equal(lexical.root.children[0].type, 'horizontalrule')
    })

    it('can convert multiple <hr> into cards', function () {
      // $insertNodes() doesn't work with just decorators, uses $appendNodes() instead
      const lexical = htmlToLexical('<hr><hr>', options)

      assert.ok(lexical.root)
      assert.equal(lexical.root.children.length, 2)
      assert.equal(lexical.root.children[0].type, 'horizontalrule')
      assert.equal(lexical.root.children[1].type, 'horizontalrule')
    })

    it('can convert <p>Hello World</p><hr> into cards', function () {
      // ensure decorators still get inserted OK after other nodes
      const lexical = htmlToLexical('<p>Hello World</p><hr>', options)

      assert.ok(lexical.root)
      assert.equal(lexical.root.children.length, 2)
      assert.equal(lexical.root.children[0].type, 'paragraph')
      assert.equal(lexical.root.children[0].children.length, 1)
      assert.equal(lexical.root.children[0].children[0].text, 'Hello World')
      assert.equal(lexical.root.children[1].type, 'horizontalrule')
    })

    it('can convert <hr><p>Hello World</p> into cards', function () {
      // ensure decorators still get inserted OK before other nodes
      const lexical = htmlToLexical('<hr><p>Hello World</p>', options)

      assert.ok(lexical.root)
      assert.equal(lexical.root.children.length, 2)
      assert.equal(lexical.root.children[0].type, 'horizontalrule')
      assert.equal(lexical.root.children[1].type, 'paragraph')
      assert.equal(lexical.root.children[1].children.length, 1)
      assert.equal(lexical.root.children[1].children[0].text, 'Hello World')
    })

    it('can convert <img> into card', function () {
      const lexical = htmlToLexical('<img src="https://example.com">', options)

      assert.ok(lexical.root)
      assert.equal(lexical.root.children.length, 1)
      assert.equal(lexical.root.children[0].type, 'image')
      assert.equal(lexical.root.children[0].src, 'https://example.com/')
    })

    it('can convert alternative quote styles', function () {
      const lexical = htmlToLexical('<blockquote class="inkling-blockquote-alt">Hello World</blockquote>', options)

      assert.ok(lexical.root)
      assert.equal(lexical.root.children.length, 1)
      assert.equal(lexical.root.children[0].type, 'extended-quote')
      assert.equal(lexical.root.children[0].children.length, 1)
      assert.equal(lexical.root.children[0].children[0].text, 'Hello World')
    })
  })

  describe('Unknown elements', function () {
    it('handles aside elements', function () {
      const lexical = htmlToLexical('<aside>Hello World</aside>', options)

      assert.ok(lexical.root)
      assert.equal(lexical.root.children.length, 1)
      assert.equal(lexical.root.children[0].type, 'paragraph')
      assert.equal(lexical.root.children[0].children.length, 1)
      assert.equal(lexical.root.children[0].children[0].text, 'Hello World')
    })
  })

  describe('HTML oddities', function () {
    it('handles plain text', function () {
      const lexical = htmlToLexical('Hello World', options)

      assert.ok(lexical.root)
      assert.equal(lexical.root.children.length, 1)
      assert.equal(lexical.root.children[0].type, 'paragraph')
      assert.equal(lexical.root.children[0].children.length, 1)
      assert.equal(lexical.root.children[0].children[0].text, 'Hello World')
    })

    it('handles text with no wrapper element', function () {
      const lexical = htmlToLexical('<p>Paragraph</p>\nPlain text 1\n<h2>Title</h2>\nPlain text 2', options)

      assert.ok(lexical.root)
      assert.equal(lexical.root.children.length, 4)
      assert.equal(lexical.root.children[0].type, 'paragraph')
      assert.equal(lexical.root.children[0].children[0].text, 'Paragraph')
      assert.equal(lexical.root.children[1].type, 'paragraph')
      assert.equal(lexical.root.children[1].children[0].text, 'Plain text 1')
      assert.equal(lexical.root.children[2].type, 'extended-heading')
      assert.equal(lexical.root.children[2].children[0].text, 'Title')
      assert.equal(lexical.root.children[3].type, 'paragraph')
      assert.equal(lexical.root.children[3].children[0].text, 'Plain text 2')
    })

    it('handles heading and paragraph elements inside list items', function () {
      const html = `
                <ul>
                    <li>
                        <h4>Heading</h4>
                        <p>Paragraph</p>
                    </li>
                </ul>
            `
      const lexical = htmlToLexical(html, options)
      assert.ok(lexical.root)
      assert.equal(lexical.root.children.length, 2)
      assert.equal(lexical.root.children[0].type, 'extended-heading')
      assert.equal(lexical.root.children[0].children[0].text, 'Heading')
      assert.equal(lexical.root.children[1].type, 'paragraph')
      assert.equal(lexical.root.children[1].children[0].text, 'Paragraph')
    })

    it('handles heading and non-paragraph text inside list items', function () {
      const html = `
                <ul>
                    <li>
                        <h4>Heading</h4>
                        Paragraph
                    </li>
                </ul>
            `
      const lexical = htmlToLexical(html, options)
      assert.ok(lexical.root)
      assert.equal(lexical.root.children.length, 2)
      assert.equal(lexical.root.children[0].type, 'extended-heading')
      assert.equal(lexical.root.children[0].children[0].text, 'Heading')
      assert.equal(lexical.root.children[1].type, 'paragraph')
      assert.equal(lexical.root.children[1].children[0].text, 'Paragraph')
    })

    it('handles heading and non-paragraph text inside nested list items', function () {
      const html = `
                <ul>
                    <li>
                        <ul>
                            <li>
                                <h4>Heading</h4>
                                Paragraph
                            </li>
                        </ul>
                    </li>
                </ul>
            `
      const lexical = htmlToLexical(html, options)
      assert.ok(lexical.root)
      assert.equal(lexical.root.children.length, 3)
      // empty list item is left after extracting invalid children
      // NOTE: if we don't want this it needs to be fixed in the denest transform but we need
      //       to be careful not to break general editing
      assert.equal(lexical.root.children[0].type, 'list')
      assert.equal(lexical.root.children[0].children[0].type, 'listitem')
      assert.equal(lexical.root.children[0].children[0].children.length, 0)
      // extracted children
      assert.equal(lexical.root.children[1].type, 'extended-heading')
      assert.equal(lexical.root.children[1].children[0].text, 'Heading')
      assert.equal(lexical.root.children[2].type, 'paragraph')
      assert.equal(lexical.root.children[2].children[0].text, 'Paragraph')
    })
  })

  describe('HTML from Lexical cards', function () {
    // note: some cards are not intended to convert from html: markdown and other web-only cards
    //  this test is to make sure our parser methods do not intercept the cards they are not intended to handle
    it('can convert a post containing one of each card type', function () {
      const html = `
            <figure class="inkling-card inkling-image-card inkling-card-hascaption">
                <img
                    src="__INKLING_URL__/content/images/2023/10/image--1-.png"
                    class="inkling-image"
                    alt=""
                    loading="lazy"
                    width="882"
                    height="242"
                    srcset="
                        __INKLING_URL__/content/images/size/w600/2023/10/image--1-.png 600w,
                        __INKLING_URL__/content/images/2023/10/image--1-.png           882w
                    "
                    sizes="(min-width: 720px) 720px"
                />
                <figcaption><span style="white-space: pre-wrap">image</span></figcaption>
            </figure>
            <p>markdown</p>
            <!--inkling-card-begin: html-->
            html
            <!--inkling-card-end: html-->
            <figure class="inkling-card inkling-gallery-card inkling-width-wide inkling-card-hascaption">
                <div class="inkling-gallery-container">
                    <div class="inkling-gallery-row">
                        <div class="inkling-gallery-image">
                            <img
                                src="__INKLING_URL__/content/images/2023/10/4b061cbc7f034c4d475797e8f3d37f68.jpg"
                                width="736"
                                height="736"
                                loading="lazy"
                                alt=""
                                srcset="
                                    __INKLING_URL__/content/images/size/w600/2023/10/4b061cbc7f034c4d475797e8f3d37f68.jpg 600w,
                                    __INKLING_URL__/content/images/2023/10/4b061cbc7f034c4d475797e8f3d37f68.jpg           736w
                                "
                                sizes="(min-width: 720px) 720px"
                            />
                        </div>
                        <div class="inkling-gallery-image">
                            <img
                                src="__INKLING_URL__/content/images/2023/10/2560px-Mandolin_guitar_band_crystal_palace.jpg"
                                width="2000"
                                height="1526"
                                loading="lazy"
                                alt=""
                                srcset="
                                    __INKLING_URL__/content/images/size/w600/2023/10/2560px-Mandolin_guitar_band_crystal_palace.jpg   600w,
                                    __INKLING_URL__/content/images/size/w1000/2023/10/2560px-Mandolin_guitar_band_crystal_palace.jpg 1000w,
                                    __INKLING_URL__/content/images/size/w1600/2023/10/2560px-Mandolin_guitar_band_crystal_palace.jpg 1600w,
                                    __INKLING_URL__/content/images/size/w2400/2023/10/2560px-Mandolin_guitar_band_crystal_palace.jpg 2400w
                                "
                                sizes="(min-width: 720px) 720px"
                            />
                        </div>
                    </div>
                </div>
                <figcaption>
                    <p dir="ltr"><span style="white-space: pre-wrap">gallery</span></p>
                </figcaption>
            </figure>
            <hr />
            <figure class="inkling-card inkling-bookmark-card inkling-card-hascaption">
                <a class="inkling-bookmark-container" href="https://inkling.local/">
                    <div class="inkling-bookmark-content">
                        <div class="inkling-bookmark-title">
                            Inkling: The Creator Economy Platform
                        </div>
                        <div class="inkling-bookmark-description">
                            The world’s most popular modern publishing platform for creating
                            a new media platform. Used by Apple, SkyNews, Buffer,
                            Kickstarter, and thousands more.
                        </div>
                        <div class="inkling-bookmark-metadata">
                            <img
                                class="inkling-bookmark-icon"
                                src="https://inkling.local/favicon.ico"
                                alt=""
                            /><span class="inkling-bookmark-author"
                                >Inkling - The Professional Publishing Platform</span
                            >
                        </div>
                    </div>
                    <div class="inkling-bookmark-thumbnail">
                        <img src="https://inkling.local/images/meta/inkling.png" alt="" onerror="this.style.display = 'none'"/>
                    </div>
                </a>
                <figcaption>
                    <p dir="ltr"><span style="white-space: pre-wrap">bookmark</span></p>
                </figcaption>
            </figure>
            <div class="inkling-card inkling-button-card inkling-align-center">
                <a href="__INKLING_URL__/" class="inkling-btn inkling-btn-accent">button</a>
            </div>
            <div class="inkling-card inkling-callout-card inkling-callout-card-blue">
                <div class="inkling-callout-emoji">💡</div>
                <div class="inkling-callout-text">callout</div>
            </div>
            <div class="inkling-card inkling-toggle-card" data-inkling-toggle-state="close">
                <div class="inkling-toggle-heading">
                    <h4 class="inkling-toggle-heading-text">
                        <span style="white-space: pre-wrap">toggle header</span>
                    </h4>
                    <button
                        class="inkling-toggle-card-icon"
                        aria-label="Expand toggle to read content"
                    >
                        <svg
                            id="Regular"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                        >
                            <path
                                class="cls-1"
                                d="M23.25,7.311,12.53,18.03a.749.749,0,0,1-1.06,0L.75,7.311"
                            ></path>
                        </svg>
                    </button>
                </div>
                <div class="inkling-toggle-content">
                    <p dir="ltr">
                        <span style="white-space: pre-wrap">toggle content</span>
                    </p>
                </div>
            </div>
            <figure
                class="inkling-card inkling-video-card inkling-width-regular inkling-card-hascaption"
                data-inkling-thumbnail="http://localhost:2368/content/media/2023/10/CleanShot-2023-03-24-at-11.10.13_thumb.jpg"
                data-inkling-custom-thumbnail=""
            >
                <div class="inkling-video-container">
                    <video
                        src="__INKLING_URL__/content/media/2023/10/CleanShot-2023-03-24-at-11.10.13.mp4"
                        poster="https://img.spacergif.org/v1/884x744/0a/spacer.png"
                        width="884"
                        height="744"
                        playsinline=""
                        preload="metadata"
                        style="
                            background: transparent
                                url('__INKLING_URL__/content/media/2023/10/CleanShot-2023-03-24-at-11.10.13_thumb.jpg')
                                50% 50% / cover no-repeat;
                        "
                    ></video>
                    <div class="inkling-video-overlay">
                        <button class="inkling-video-large-play-icon" aria-label="Play video">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                <path
                                    d="M23.14 10.608 2.253.164A1.559 1.559 0 0 0 0 1.557v20.887a1.558 1.558 0 0 0 2.253 1.392L23.14 13.393a1.557 1.557 0 0 0 0-2.785Z"
                                ></path>
                            </svg>
                        </button>
                    </div>
                    <div class="inkling-video-player-container">
                        <div class="inkling-video-player">
                            <button class="inkling-video-play-icon" aria-label="Play video">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                    <path
                                        d="M23.14 10.608 2.253.164A1.559 1.559 0 0 0 0 1.557v20.887a1.558 1.558 0 0 0 2.253 1.392L23.14 13.393a1.557 1.557 0 0 0 0-2.785Z"
                                    ></path>
                                </svg>
                            </button>
                            <button class="inkling-video-pause-icon inkling-video-hide" aria-label="Pause video">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                    <rect
                                        x="3"
                                        y="1"
                                        width="7"
                                        height="22"
                                        rx="1.5"
                                        ry="1.5"
                                    ></rect>
                                    <rect
                                        x="14"
                                        y="1"
                                        width="7"
                                        height="22"
                                        rx="1.5"
                                        ry="1.5"
                                    ></rect>
                                </svg>
                            </button>
                            <span class="inkling-video-current-time">0:00</span>
                            <div class="inkling-video-time">
                                /<span class="inkling-video-duration">0:30</span>
                            </div>
                            <input
                                type="range"
                                class="inkling-video-seek-slider"
                                max="100"
                                value="0"
                            />
                            <button class="inkling-video-playback-rate" aria-label="Adjust playback speed">1×</button>
                            <button class="inkling-video-unmute-icon" aria-label="Unmute">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                    <path
                                        d="M15.189 2.021a9.728 9.728 0 0 0-7.924 4.85.249.249 0 0 1-.221.133H5.25a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3h1.794a.249.249 0 0 1 .221.133 9.73 9.73 0 0 0 7.924 4.85h.06a1 1 0 0 0 1-1V3.02a1 1 0 0 0-1.06-.998Z"
                                    ></path>
                                </svg>
                            </button>
                            <button class="inkling-video-mute-icon inkling-video-hide" aria-label="Mute">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                    <path
                                        d="M16.177 4.3a.248.248 0 0 0 .073-.176v-1.1a1 1 0 0 0-1.061-1 9.728 9.728 0 0 0-7.924 4.85.249.249 0 0 1-.221.133H5.25a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3h.114a.251.251 0 0 0 .177-.073ZM23.707 1.706A1 1 0 0 0 22.293.292l-22 22a1 1 0 0 0 0 1.414l.009.009a1 1 0 0 0 1.405-.009l6.63-6.631A.251.251 0 0 1 8.515 17a.245.245 0 0 1 .177.075 10.081 10.081 0 0 0 6.5 2.92 1 1 0 0 0 1.061-1V9.266a.247.247 0 0 1 .073-.176Z"
                                    ></path>
                                </svg>
                            </button>
                            <input
                                type="range"
                                class="inkling-video-volume-slider"
                                max="100"
                                value="100"
                            />
                        </div>
                    </div>
                </div>
                <figcaption>
                    <p dir="ltr"><span style="white-space: pre-wrap">video</span></p>
                </figcaption>
            </figure>
            <div class="inkling-card inkling-audio-card">
                <img
                    src=""
                    alt="audio-thumbnail"
                    class="inkling-audio-thumbnail inkling-audio-hide"
                />
                <div class="inkling-audio-thumbnail placeholder">
                    <svg width="24" height="24" fill="none">
                        <path
                            fill-rule="evenodd"
                            clip-rule="evenodd"
                            d="M7.5 15.33a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm-2.25.75a2.25 2.25 0 1 1 4.5 0 2.25 2.25 0 0 1-4.5 0ZM15 13.83a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm-2.25.75a2.25 2.25 0 1 1 4.5 0 2.25 2.25 0 0 1-4.5 0Z"
                        ></path>
                        <path
                            fill-rule="evenodd"
                            clip-rule="evenodd"
                            d="M14.486 6.81A2.25 2.25 0 0 1 17.25 9v5.579a.75.75 0 0 1-1.5 0v-5.58a.75.75 0 0 0-.932-.727.755.755 0 0 1-.059.013l-4.465.744a.75.75 0 0 0-.544.72v6.33a.75.75 0 0 1-1.5 0v-6.33a2.25 2.25 0 0 1 1.763-2.194l4.473-.746Z"
                        ></path>
                        <path
                            fill-rule="evenodd"
                            clip-rule="evenodd"
                            d="M3 1.5a.75.75 0 0 0-.75.75v19.5a.75.75 0 0 0 .75.75h18a.75.75 0 0 0 .75-.75V5.133a.75.75 0 0 0-.225-.535l-.002-.002-3-2.883A.75.75 0 0 0 18 1.5H3ZM1.409.659A2.25 2.25 0 0 1 3 0h15a2.25 2.25 0 0 1 1.568.637l.003.002 3 2.883a2.25 2.25 0 0 1 .679 1.61V21.75A2.25 2.25 0 0 1 21 24H3a2.25 2.25 0 0 1-2.25-2.25V2.25c0-.597.237-1.169.659-1.591Z"
                        ></path>
                    </svg>
                </div>
                <div class="inkling-audio-player-container">
                    <audio
                        src="__INKLING_URL__/content/media/2023/10/redal660320d1_02_Im_Thinking_Tonight_of_My_Blue_Eyes.mp3"
                        preload="metadata"
                    ></audio>
                    <div class="inkling-audio-title">
                        Redal660320d1 02 Im Thinking Tonight of My Blue Eyes
                    </div>
                    <div class="inkling-audio-player">
                        <button class="inkling-audio-play-icon" aria-label="Play audio">
                            <svg viewBox="0 0 24 24">
                                <path
                                    d="M23.14 10.608 2.253.164A1.559 1.559 0 0 0 0 1.557v20.887a1.558 1.558 0 0 0 2.253 1.392L23.14 13.393a1.557 1.557 0 0 0 0-2.785Z"
                                ></path>
                            </svg></button
                        ><button class="inkling-audio-pause-icon inkling-audio-hide" aria-label="Pause audio">
                            <svg viewBox="0 0 24 24">
                                <rect
                                    x="3"
                                    y="1"
                                    width="7"
                                    height="22"
                                    rx="1.5"
                                    ry="1.5"
                                ></rect>
                                <rect
                                    x="14"
                                    y="1"
                                    width="7"
                                    height="22"
                                    rx="1.5"
                                    ry="1.5"
                                ></rect>
                            </svg></button
                        ><span class="inkling-audio-current-time">0:00</span>
                        <div class="inkling-audio-time">
                            /<span class="inkling-audio-duration">152.607347</span>
                        </div>
                        <input
                            type="range"
                            class="inkling-audio-seek-slider"
                            max="100"
                            value="0"
                        /><button class="inkling-audio-playback-rate" aria-label="Adjust playback speed">1×</button
                        ><button class="inkling-audio-unmute-icon" aria-label="Unmute">
                            <svg viewBox="0 0 24 24">
                                <path
                                    d="M15.189 2.021a9.728 9.728 0 0 0-7.924 4.85.249.249 0 0 1-.221.133H5.25a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3h1.794a.249.249 0 0 1 .221.133 9.73 9.73 0 0 0 7.924 4.85h.06a1 1 0 0 0 1-1V3.02a1 1 0 0 0-1.06-.998Z"
                                ></path>
                            </svg></button
                        ><button class="inkling-audio-mute-icon inkling-audio-hide" aria-label="Mute">
                            <svg viewBox="0 0 24 24">
                                <path
                                    d="M16.177 4.3a.248.248 0 0 0 .073-.176v-1.1a1 1 0 0 0-1.061-1 9.728 9.728 0 0 0-7.924 4.85.249.249 0 0 1-.221.133H5.25a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3h.114a.251.251 0 0 0 .177-.073ZM23.707 1.706A1 1 0 0 0 22.293.292l-22 22a1 1 0 0 0 0 1.414l.009.009a1 1 0 0 0 1.405-.009l6.63-6.631A.251.251 0 0 1 8.515 17a.245.245 0 0 1 .177.075 10.081 10.081 0 0 0 6.5 2.92 1 1 0 0 0 1.061-1V9.266a.247.247 0 0 1 .073-.176Z"
                                ></path>
                            </svg></button
                        ><input
                            type="range"
                            class="inkling-audio-volume-slider"
                            max="100"
                            value="100"
                        />
                    </div>
                </div>
            </div>
            <div class="inkling-card inkling-file-card">
                <a
                    class="inkling-file-card-container"
                    href="__INKLING_URL__/content/files/2023/10/20170622_WCR_Sensory_Lexicon_2-0-1.pdf"
                    title="Download"
                    download=""
                >
                    <div class="inkling-file-card-contents">
                        <div class="inkling-file-card-title">
                            20170622_WCR_Sensory_Lexicon_2-0-1
                        </div>
                        <div class="inkling-file-card-caption"></div>
                        <div class="inkling-file-card-metadata">
                            <div class="inkling-file-card-filename">
                                20170622_WCR_Sensory_Lexicon_2-0-1.pdf
                            </div>
                            <div class="inkling-file-card-filesize">1 MB</div>
                        </div>
                    </div>
                    <div class="inkling-file-card-icon">
                        <svg viewBox="0 0 24 24">
                            <defs>
                                <style>
                                    .a {
                                        fill: none;
                                        stroke: currentColor;
                                        stroke-linecap: round;
                                        stroke-linejoin: round;
                                        stroke-width: 1.5px;
                                    }
                                </style>
                            </defs>
                            <title>download-circle</title>
                            <polyline
                                class="a"
                                points="8.25 14.25 12 18 15.75 14.25"
                            ></polyline>
                            <line class="a" x1="12" y1="6.75" x2="12" y2="18"></line>
                            <circle class="a" cx="12" cy="12" r="11.25"></circle>
                        </svg>
                    </div>
                </a>
            </div>
            <div
                class="inkling-card inkling-header-card inkling-v2 inkling-width-full inkling-content-wide"
                style="background-color: #000000"
                data-background-color="#000000"
            >
                <div class="inkling-header-card-content">
                    <div class="inkling-header-card-text inkling-align-center">
                        <h2
                            id="header-v2"
                            class="inkling-header-card-heading"
                            style="color: #ffffff"
                            data-text-color="#FFFFFF"
                        >
                            <span style="white-space: pre-wrap">header v2</span>
                        </h2>
                        <p
                            id="subheader"
                            class="inkling-header-card-subheading"
                            style="color: #ffffff"
                            data-text-color="#FFFFFF"
                        >
                            <span style="white-space: pre-wrap">subheader</span>
                        </p>
                    </div>
                </div>
            </div>
            `

      const lexical = htmlToLexical(html, options)
      const outputNodeTypes = lexical.root.children.map((child: NodeJSON) => child.type)
      assert.equal(outputNodeTypes.length, 13)
      assert.deepEqual(outputNodeTypes, [
        'image',
        'paragraph', // markdown parses as paragraph/text content
        'html',
        'gallery',
        'horizontalrule',
        'bookmark',
        'button',
        'callout',
        'toggle',
        'video',
        'audio',
        'file',
        'header',
      ])
    })
  })

  describe('BRs', function () {
    it('inside top-level text', function () {
      const html = `Before <br> After`

      const lexical = htmlToLexical(html, options)
      assert.deepEqual(lexical, {
        root: {
          children: [
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text: 'Before',
                  type: 'extended-text',
                  version: 1,
                },
                {
                  type: 'linebreak',
                  version: 1,
                },
                {
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text: 'After',
                  type: 'extended-text',
                  version: 1,
                },
              ],
              direction: null,
              format: '',
              indent: 0,
              textFormat: 0,
              textStyle: '',
              type: 'paragraph',
              version: 1,
            },
          ],
          direction: null,
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
        },
      })
    })

    it('after div', function () {
      const html = `<p>Before <div></div> test <br> After break</p>`

      const lexical = htmlToLexical(html, options)
      assert.deepEqual(lexical, {
        root: {
          children: [
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text: 'Before',
                  type: 'extended-text',
                  version: 1,
                },
              ],
              direction: null,
              format: '',
              indent: 0,
              textFormat: 0,
              textStyle: '',
              type: 'paragraph',
              version: 1,
            },
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text: 'test',
                  type: 'extended-text',
                  version: 1,
                },
                {
                  type: 'linebreak',
                  version: 1,
                },
                {
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text: 'After break',
                  type: 'extended-text',
                  version: 1,
                },
              ],
              direction: null,
              format: '',
              indent: 0,
              textFormat: 0,
              textStyle: '',
              type: 'paragraph',
              version: 1,
            },
            {
              children: [],
              direction: null,
              format: '',
              indent: 0,
              textFormat: 0,
              textStyle: '',
              type: 'paragraph',
              version: 1,
            },
          ],
          direction: null,
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
        },
      })
    })
  })
})
