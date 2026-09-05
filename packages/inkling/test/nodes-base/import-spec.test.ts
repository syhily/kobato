import type { LexicalNodeConfig } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'

import type { CardImportSpec } from '@/nodes/base/import-spec'

import { createDocument } from '#/nodes-base/test-utils/index'
import { generateDecoratorNode } from '@/nodes/base/generate-decorator-node'

const baseProperties = [
  { name: 'text', default: 'default-text' },
  { name: 'url', default: 'default-url' },
  { name: 'count', default: 0 },
] as const

function generateWithSpec(
  importSpec: CardImportSpec,
  properties: readonly { name: string; default: unknown }[] = baseProperties,
) {
  return generateDecoratorNode({
    nodeType: `spec-test-${Math.random().toString(36).slice(2)}`,
    properties,
    importSpec,
  })
}

function firstElement(document: Document, selector: string) {
  const element = document.querySelector(selector)
  if (!element) {
    throw new Error(`no element matching ${selector}`)
  }
  return element as HTMLElement
}

// Node construction requires an active editor that has the constructed class
// registered, so each constructing test runs inside an editor created with
// the classes under test
function withEditor(nodes: LexicalNodeConfig[], testFn: () => void) {
  return new Promise<void>((resolve, reject) => {
    const testEditor = createHeadlessEditor({ nodes })
    testEditor.update(() => {
      try {
        testFn()
        resolve()
      } catch (e) {
        reject(e)
      }
    })
  })
}

describe('import spec derivation', function () {
  describe('spec installation (R1)', function () {
    it('a spec-less generated class yields no conversions', function () {
      const NodeClass = generateDecoratorNode({ nodeType: 'spec-less', properties: [] })

      expect(NodeClass.importDOM()).toBe(null)
      expect(NodeClass.importSpec).toBe(undefined)
    })

    it('exposes the spec object as a static on the generated class', function () {
      const importSpec: CardImportSpec = { conversions: [{ tag: 'hr', priority: 0, reads: [] }] }
      const NodeClass = generateWithSpec(importSpec, [])

      expect(NodeClass.importSpec).toBe(importSpec)
    })
  })

  describe('guard matching', function () {
    const importSpec: CardImportSpec = {
      conversions: [
        { tag: 'div', priority: 1, guardClass: 'inkling-test-card', reads: [] },
        { tag: 'figure', priority: 0, guardSelector: 'img', reads: [] },
      ],
    }

    it('rejects elements missing the guard class', function () {
      const NodeClass = generateWithSpec(importSpec, [])
      const map = NodeClass.importDOM()!
      const document = createDocument('<div class="inkling-other-card"></div><div class="inkling-test-card"></div>')

      expect(map.div!(firstElement(document, '.inkling-other-card'))).toBe(null)
      expect(map.div!(firstElement(document, '.inkling-test-card'))).not.toBe(null)
    })

    it('rejects elements missing the guard selector', function () {
      const NodeClass = generateWithSpec(importSpec, [])
      const map = NodeClass.importDOM()!
      const document = createDocument('<figure><span></span></figure><figure><img src="/x.png" /></figure>')
      const figures = document.querySelectorAll('figure')

      expect(map.figure!(figures[0])).toBe(null)
      expect(map.figure!(figures[1])).not.toBe(null)
    })
  })

  describe('read pipeline (R3)', function () {
    it('constructs the node from a conversion with no reads', function () {
      const NodeClass = generateWithSpec({ conversions: [{ tag: 'hr', priority: 0, reads: [] }] }, [])
      return withEditor([NodeClass], function () {
        const map = NodeClass.importDOM()!
        const document = createDocument('<hr />')
        const element = firstElement(document, 'hr')

        const result = map.hr!(element)!.conversion(element)

        expect(result?.node).toBeInstanceOf(NodeClass)
      })
    })

    it('applies fallback when the located element is missing, omits without one', function () {
      const importSpec: CardImportSpec = {
        conversions: [
          {
            tag: 'div',
            priority: 1,
            reads: [
              { name: 'text', kind: 'text', selector: '.missing', fallback: '' },
              { name: 'url', kind: 'attribute', attribute: 'href', selector: '.missing' },
            ],
          },
        ],
      }
      const NodeClass = generateWithSpec(importSpec)
      return withEditor([NodeClass], function () {
        const map = NodeClass.importDOM()!
        const document = createDocument('<div></div>')
        const element = firstElement(document, 'div')

        const result = map.div!(element)!.conversion(element)
        const node = result?.node as InstanceType<typeof NodeClass>

        expect(node.text).toBe('')
        expect(node.url).toBe('default-url')
      })
    })

    it('drops falsy values with omit: falsy, before and after parse', function () {
      const importSpec: CardImportSpec = {
        conversions: [
          {
            tag: 'div',
            priority: 1,
            reads: [
              // empty text -> dropped before parse
              { name: 'text', kind: 'text', selector: '.empty', omit: 'falsy' },
              // parse returns undefined -> key omitted
              {
                name: 'count',
                kind: 'text',
                selector: '.garbage',
                parse: (raw) => {
                  const parsed = Number(raw)
                  return Number.isInteger(parsed) ? parsed : undefined
                },
              },
              // falsy parse result -> dropped after parse
              {
                name: 'url',
                kind: 'text',
                selector: '.zero',
                omit: 'falsy',
                parse: (raw) => Number(raw),
              },
            ],
          },
        ],
      }
      const NodeClass = generateWithSpec(importSpec)
      return withEditor([NodeClass], function () {
        const map = NodeClass.importDOM()!
        const document = createDocument(
          '<div><span class="empty"></span><span class="garbage">abc</span><span class="zero">0</span></div>',
        )
        const element = firstElement(document, 'div')

        const result = map.div!(element)!.conversion(element)
        const node = result?.node as InstanceType<typeof NodeClass>

        expect(node.text).toBe('default-text')
        expect(node.count).toBe(0)
        expect(node.url).toBe('default-url')
      })
    })

    it('aborts the conversion when a required read comes up falsy', function () {
      const importSpec: CardImportSpec = {
        conversions: [
          {
            tag: 'figure',
            priority: 1,
            reads: [
              { name: 'url', kind: 'property', property: 'src', selector: 'video', required: true },
              { name: 'text', kind: 'text', selector: '.title' },
            ],
          },
        ],
      }
      const NodeClass = generateWithSpec(importSpec)
      return withEditor([NodeClass], function () {
        const map = NodeClass.importDOM()!
        const withVideo = createDocument('<figure><video src="/x.mp4"></video><span class="title">t</span></figure>')
        const withoutVideo = createDocument('<figure><span class="title">t</span></figure>')
        const present = firstElement(withVideo, 'figure')
        const missing = firstElement(withoutVideo, 'figure')

        expect(map.figure!(missing)!.conversion(missing)).toBe(null)
        const result = map.figure!(present)!.conversion(present)
        expect(result?.node).toBeInstanceOf(NodeClass)
      })
    })

    it('trims extracted strings before parse', function () {
      const importSpec: CardImportSpec = {
        conversions: [
          {
            tag: 'div',
            priority: 1,
            reads: [
              {
                name: 'count',
                kind: 'html',
                selector: '.duration',
                trim: true,
                parse: (raw) => {
                  const [rawMinutes, rawSeconds = '0'] = raw.split(':')
                  const minutes = Number(rawMinutes.trim())
                  const seconds = Number(rawSeconds.trim())
                  return Number.isInteger(minutes) && Number.isInteger(seconds) ? minutes * 60 + seconds : undefined
                },
              },
            ],
          },
        ],
      }
      const NodeClass = generateWithSpec(importSpec)
      return withEditor([NodeClass], function () {
        const map = NodeClass.importDOM()!
        const document = createDocument('<div><span class="duration"> 1:02 </span></div>')
        const element = firstElement(document, 'div')

        const result = map.div!(element)!.conversion(element)
        const node = result?.node as InstanceType<typeof NodeClass>

        expect(node.count).toBe(62)
      })
    })

    it('reads class maps in order, with raw captures, value maps, and fallback', function () {
      const importSpec: CardImportSpec = {
        conversions: [
          {
            tag: 'figure',
            priority: 0,
            reads: [
              {
                name: 'text',
                kind: 'classMap',
                classMap: [
                  { pattern: /inkling-width-(wide|full)/ },
                  { pattern: /layout-(FillWidth|OutsetCenter)/, map: { FillWidth: 'full', OutsetCenter: 'wide' } },
                ],
              },
              { name: 'url', kind: 'classMap', classMap: [{ pattern: /inkling-mode-(dark)/ }], fallback: 'light' },
            ],
          },
        ],
      }
      const NodeClass = generateWithSpec(importSpec)
      return withEditor([NodeClass], function () {
        const map = NodeClass.importDOM()!
        const document = createDocument(
          '<figure class="layout-OutsetCenter"></figure><figure class="inkling-width-wide"></figure><figure></figure>',
        )
        const [graf, inkling, bare] = document.querySelectorAll('figure')

        const readWidth = (element: HTMLElement) =>
          (map.figure!(element)!.conversion(element)!.node as InstanceType<typeof NodeClass>).text
        const readMode = (element: HTMLElement) =>
          (map.figure!(element)!.conversion(element)!.node as InstanceType<typeof NodeClass>).url

        expect(readWidth(graf)).toBe('wide')
        expect(readWidth(inkling)).toBe('wide')
        expect(readWidth(bare)).toBe('default-text')
        expect(readMode(bare)).toBe('light')
      })
    })

    it('merges composite reads under their provides keys and aborts on a missing located element', function () {
      const importSpec: CardImportSpec = {
        conversions: [
          {
            tag: 'figure',
            priority: 0,
            reads: [
              {
                name: 'imageAttributes',
                kind: 'composite',
                selector: 'img',
                provides: ['url', 'count'],
                read: (element) => ({ url: element.getAttribute('src'), count: 42, ignored: 'nope' }),
              },
            ],
          },
        ],
      }
      const NodeClass = generateWithSpec(importSpec)
      return withEditor([NodeClass], function () {
        const map = NodeClass.importDOM()!
        const withImg = createDocument('<figure><img src="/x.png" /></figure>')
        const withoutImg = createDocument('<figure></figure>')
        const present = firstElement(withImg, 'figure')
        const missing = firstElement(withoutImg, 'figure')

        const result = map.figure!(present)!.conversion(present)
        const node = result?.node as InstanceType<typeof NodeClass>
        expect(node.url).toBe('/x.png')
        expect(node.count).toBe(42)
        expect('ignored' in (node as unknown as Record<string, unknown>)).toBe(false)

        expect(map.figure!(missing)!.conversion(missing)).toBe(null)
      })
    })
  })

  describe('dynamic-this construction (R2)', function () {
    it('a subclass invoking the derived importDOM constructs the subclass', function () {
      const importSpec: CardImportSpec = { conversions: [{ tag: 'hr', priority: 0, reads: [] }] }
      const BaseClass = generateWithSpec(importSpec, [])
      class SubClass extends BaseClass {}

      return withEditor([SubClass], function () {
        const map = SubClass.importDOM()!
        const document = createDocument('<hr />')
        const element = firstElement(document, 'hr')

        const result = map.hr!(element)!.conversion(element)

        expect(result?.node).toBeInstanceOf(SubClass)
      })
    })
  })

  describe('spec validation (R5)', function () {
    it('throws at class-creation time when a read names an unknown property', function () {
      expect(() =>
        generateWithSpec({
          conversions: [{ tag: 'div', priority: 1, reads: [{ name: 'unknown', kind: 'text' }] }],
        }),
      ).toThrow('importSpec read "unknown"')
    })

    it('throws when a composite read provides an unknown property', function () {
      expect(() =>
        generateWithSpec({
          conversions: [
            {
              tag: 'figure',
              priority: 0,
              reads: [{ name: 'attrs', kind: 'composite', provides: ['url', 'unknown'], read: () => ({}) }],
            },
          ],
        }),
      ).toThrow('importSpec read "unknown"')
    })
  })
})
