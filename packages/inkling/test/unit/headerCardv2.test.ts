import type { LexicalEditor } from 'lexical'

import { createTestEditor, editorTest } from '#/utils/test-editor'
import { $createHeaderNode, $isHeaderNode, HeaderNode, type HeaderNodeDataset } from '@/nodes/HeaderNode'

const editorNodes = [HeaderNode]

describe('HeaderNode v2', function () {
  let editor: LexicalEditor
  let dataset: HeaderNodeDataset

  beforeEach(function () {
    editor = createTestEditor({ nodes: editorNodes })

    dataset = {
      version: 2,
      size: 'small',
      style: 'dark',
      buttonEnabled: false,
      buttonUrl: '',
      buttonText: '',
      header:
        '<span style="white-space: pre-wrap;">Hello header</span><br><span style="white-space: pre-wrap;">On two lines, even.</span>',
      subheader:
        '<p dir="ltr"><span style="white-space: pre-wrap;">Subheadings are awesome</span><br><span style="white-space: pre-wrap;">I like them a lot.</span></p>',
      backgroundImageSrc: '',
      accentColor: '#ff0095',
      alignment: 'center',
      backgroundColor: '#000000',
      backgroundImageWidth: null,
      backgroundImageHeight: null,
      backgroundSize: 'cover',
      textColor: '#FFFFFF',
      buttonColor: '#ffffff',
      buttonTextColor: '#000000',
      layout: 'full',
      swapped: false,
    }
  })

  describe('Content load and export testing', function () {
    it(
      'handles titles with extra br',
      editorTest(
        () => editor,
        function () {
          dataset.header = '<span>Product title!</span> <br><span>Hello part 2</span>'
          const headerNode = $createHeaderNode(dataset)
          const json = headerNode.exportJSON()
          const heading = json.header
          expect(heading).toEqual(
            '<span style="white-space: pre-wrap;">Product title!</span><br><span style="white-space: pre-wrap;">Hello part 2</span>',
          )
        },
      ),
    )
    it(
      'loads and unwraps headers when wrapped with p',
      editorTest(
        () => editor,
        function () {
          dataset.header = '<p><span>Product title!</span> <br><span>Hello part 2</span></p>'
          const headerNode = $createHeaderNode(dataset)
          const json = headerNode.exportJSON()
          const heading = json.header
          expect(heading).toEqual(
            '<span style="white-space: pre-wrap;">Product title!</span><br><span style="white-space: pre-wrap;">Hello part 2</span>',
          )
        },
      ),
    )
    it(
      'allows br tags in subheaders',
      editorTest(
        () => editor,
        function () {
          dataset.subheader = '<span>Product title!</span> <br><span>Hello part 2</span>'
          const headerNode = $createHeaderNode(dataset)
          const json = headerNode.exportJSON()
          const subheading = json.subheader
          expect(subheading).toEqual(
            '<span style="white-space: pre-wrap;">Product title!</span><br><span style="white-space: pre-wrap;">Hello part 2</span>',
          )
        },
      ),
    )
    it(
      'can handle subheaders that are wrapped in p tags',
      editorTest(
        () => editor,
        function () {
          dataset.subheader = '<p><span>Product title!</span> <br><span>Hello part 2</span></p>'
          const headerNode = $createHeaderNode(dataset)
          const json = headerNode.exportJSON()
          const subheading = json.subheader
          expect(subheading).toEqual(
            '<span style="white-space: pre-wrap;">Product title!</span><br><span style="white-space: pre-wrap;">Hello part 2</span>',
          )
        },
      ),
    )
  })

  describe('Dataset property round-tripping', function () {
    it(
      'preserves layout, swapped and backgroundSize fields',
      editorTest(
        () => editor,
        function () {
          dataset.layout = 'split'
          dataset.swapped = true
          dataset.backgroundSize = 'contain'
          const headerNode = $createHeaderNode(dataset)
          const json = headerNode.exportJSON()
          expect(json.layout).toEqual('split')
          expect(json.swapped).toEqual(true)
          expect(json.backgroundSize).toEqual('contain')
        },
      ),
    )

    it(
      'uses the default property values when fields are omitted',
      editorTest(
        () => editor,
        function () {
          const minimalDataset = {
            version: 2,
            header: '<span>Hello</span>',
            subheader: '',
          }
          const headerNode = $createHeaderNode(minimalDataset)
          const json = headerNode.exportJSON()
          expect(json.layout).toEqual('full')
          expect(json.swapped).toEqual(false)
          expect(json.backgroundSize).toEqual('cover')
          expect(json.buttonEnabled).toEqual(false)
          expect(json.alignment).toEqual('center')
        },
      ),
    )

    it(
      'reports the correct card width based on layout',
      editorTest(
        () => editor,
        function () {
          dataset.layout = 'split'
          const headerNode = $createHeaderNode(dataset)
          expect(headerNode.getCardWidth()).toEqual('full')

          headerNode.layout = 'wide'
          expect(headerNode.getCardWidth()).toEqual('wide')
        },
      ),
    )
  })

  describe('DOM export → import round-trip', function () {
    const roundTripNode = (overrides: Partial<HeaderNodeDataset>) => {
      Object.assign(dataset, overrides)
      const headerNode = $createHeaderNode(dataset)
      const { element } = headerNode.exportDOM(editor)
      const converted = HeaderNode.importDOM?.()?.div?.(element)?.conversion(element)?.node
      if (!converted || Array.isArray(converted) || !$isHeaderNode(converted)) {
        throw new Error('expected the exported header div to import as a header node')
      }
      return converted
    }

    it(
      'round-trips a full layout without a background image',
      editorTest(
        () => editor,
        function () {
          const node = roundTripNode({ layout: 'full' })
          expect(node.layout).toEqual('full')
          expect(node.swapped).toEqual(false)
          expect(node.backgroundSize).toEqual('cover')
        },
      ),
    )

    it(
      'round-trips a full layout with a background image (not re-imported as split)',
      editorTest(
        () => editor,
        function () {
          const node = roundTripNode({ layout: 'full', backgroundImageSrc: 'https://example.com/bg.png' })
          expect(node.layout).toEqual('full')
          expect(node.swapped).toEqual(false)
          expect(node.backgroundSize).toEqual('cover')
        },
      ),
    )

    it(
      'round-trips a split layout with swapped and contain background size',
      editorTest(
        () => editor,
        function () {
          const node = roundTripNode({
            layout: 'split',
            swapped: true,
            backgroundSize: 'contain',
            backgroundImageSrc: 'https://example.com/bg.png',
          })
          expect(node.layout).toEqual('split')
          expect(node.swapped).toEqual(true)
          expect(node.backgroundSize).toEqual('contain')
        },
      ),
    )

    it(
      'round-trips a split layout without swapped and with cover background size',
      editorTest(
        () => editor,
        function () {
          const node = roundTripNode({
            layout: 'split',
            swapped: false,
            backgroundSize: 'cover',
            backgroundImageSrc: 'https://example.com/bg.png',
          })
          expect(node.layout).toEqual('split')
          expect(node.swapped).toEqual(false)
          expect(node.backgroundSize).toEqual('cover')
        },
      ),
    )

    it(
      'round-trips a wide layout',
      editorTest(
        () => editor,
        function () {
          const node = roundTripNode({ layout: 'wide' })
          expect(node.layout).toEqual('wide')
        },
      ),
    )

    it(
      'keeps the hand-written fallback: an image without layout classes imports as split',
      editorTest(
        () => editor,
        function () {
          const div = document.createElement('div')
          div.className = 'inkling-card inkling-header-card inkling-v2'
          div.innerHTML =
            '<picture><img class="inkling-header-card-image" src="https://example.com/bg.png" /></picture>'
          const converted = HeaderNode.importDOM?.()?.div?.(div)?.conversion(div)?.node
          if (!converted || Array.isArray(converted) || !$isHeaderNode(converted)) {
            throw new Error('expected the hand-written header div to import as a header node')
          }
          expect(converted.layout).toEqual('split')
        },
      ),
    )
  })
})
