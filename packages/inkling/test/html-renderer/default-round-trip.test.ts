import type { LexicalEditor, SerializedParagraphNode } from 'lexical'

import { HeadingNode } from '@lexical/rich-text'
import { ParagraphNode } from 'lexical'

import type { ExportDOMOptions } from '@/nodes/base'

import { htmlToLexical } from '#/utils/html-to-lexical-with-dom'
import { createTestDom } from '#/utils/render-live'
import { DEFAULT_HTML_NODES } from '@/html/default-html-nodes'
import { lexicalStateToHtml } from '@/html/headless-html'
import { BaseImageNode } from '@/nodes/base'

const dom = createTestDom()

class CustomBlockNode extends ParagraphNode {
  static getType() {
    return 'custom-block'
  }

  static clone(node: CustomBlockNode) {
    return new CustomBlockNode(node.__key)
  }

  static importJSON(serializedNode: SerializedParagraphNode) {
    return new CustomBlockNode().updateFromJSON(serializedNode)
  }
}

// Replaces the default image card when registered after the defaults
class CustomImageNode extends BaseImageNode {
  exportDOM(_editor: LexicalEditor, options: ExportDOMOptions = {}) {
    const element = options.dom!.window.document.createElement('div')
    element.setAttribute('data-custom-image', 'true')

    return { element, type: 'outer' as const }
  }
}

describe('default import-to-render round trip', function () {
  it('renders <h1> importer output with a default renderer', async function () {
    const onError = vi.fn()
    const state = htmlToLexical('<h1>Hello</h1>')

    const html = await lexicalStateToHtml(state, { dom, onError })

    expect(onError).not.toHaveBeenCalled()
    expect(html).toMatch(/<h1[^>]*>Hello<\/h1>/)
  })

  it('round-trips basic formatting (bold, line break, link)', async function () {
    const state = htmlToLexical('<p>Hello <strong>world</strong><br><a href="https://example.com">link</a></p>')

    const html = await lexicalStateToHtml(state, { dom })

    expect(html).toContain('<strong>world</strong>')
    expect(html).toContain('<br>')
    expect(html).toContain('<a href="https://example.com">link</a>')
  })

  it('round-trips an image card produced by the default importer', async function () {
    const state = htmlToLexical('<img src="https://example.com/image.png">')

    const html = await lexicalStateToHtml(state, { dom })

    expect(html).toContain('inkling-image-card')
    expect(html).toContain('src="https://example.com/image.png"')
  })

  it('keeps renderer constructor nodes additive to the defaults', async function () {
    const state = `{"root":{"children":[{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Custom block","type":"text","version":1}],"direction":"ltr","format":"","indent":0,"type":"custom-block","version":1},{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Plain paragraph","type":"text","version":1}],"direction":"ltr","format":"","indent":0,"type":"paragraph","version":1}],"direction":"ltr","format":"","indent":0,"type":"root","version":1}}`

    const html = await lexicalStateToHtml(state, { dom, nodes: [CustomBlockNode] })

    expect(html).toContain('Custom block')
    expect(html).toContain('<p>Plain paragraph</p>')
  })

  it('lets an explicit editorConfig.nodes importer override win', function () {
    const state = htmlToLexical('<h1>Hello</h1>', {
      editorConfig: {
        nodes: [HeadingNode],
        onError(e: Error) {
          throw e
        },
      },
    })

    expect(state.root.children[0].type).toBe('heading')
  })

  it('renders serialized extended-heading and extended-quote nodes by default', async function () {
    const state = `{"root":{"children":[{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Extended heading","type":"extended-text","version":1}],"direction":"ltr","format":"","indent":0,"type":"extended-heading","version":1,"tag":"h2"},{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Extended quote","type":"extended-text","version":1}],"direction":"ltr","format":"","indent":0,"type":"extended-quote","version":1}],"direction":"ltr","format":"","indent":0,"type":"root","version":1}}`

    const html = await lexicalStateToHtml(state, { dom })

    expect(html).toMatch(/<h2[^>]*>Extended heading<\/h2>/)
    expect(html).toContain('<blockquote>Extended quote</blockquote>')
  })

  it('lets a custom node registered last replace a default node type', async function () {
    const state = `{"root":{"children":[{"type":"image","version":1,"src":"https://example.com/image.png","width":null,"height":null,"title":"","alt":"","caption":"","cardWidth":"regular","href":""}],"direction":"ltr","format":"","indent":0,"type":"root","version":1}}`

    const html = await lexicalStateToHtml(state, { dom, nodes: [CustomImageNode] })

    expect(html).toBe('<div data-custom-image="true"></div>')
  })

  it('still passes genuinely unregistered states to a custom onError', async function () {
    const onError = vi.fn()
    const state = `{"root":{"children":[{"type":"definitely-not-registered","version":1}],"direction":"ltr","format":"","indent":0,"type":"root","version":1}}`

    await expect(lexicalStateToHtml(state, { dom, onError })).rejects.toThrow()
    expect(onError).toHaveBeenCalled()
  })

  it('does not mutate the shared default node array across render() calls', async function () {
    const nodesBefore = [...DEFAULT_HTML_NODES]
    const state = htmlToLexical('<p>Hello</p>')
    await lexicalStateToHtml(state, { dom, nodes: [CustomBlockNode] })
    await lexicalStateToHtml(state, { dom, nodes: [CustomBlockNode] })

    expect(DEFAULT_HTML_NODES).toEqual(nodesBefore)
  })
})
