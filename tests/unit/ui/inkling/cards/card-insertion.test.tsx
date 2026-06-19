import { createHeadlessEditor } from '@lexical/headless'
import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { $getRoot, $createParagraphNode, $createTextNode, ParagraphNode } from 'lexical'
import { describe, expect, it } from 'vitest'

import type { InklingDocument } from '@/shared/inkling/schema'

import { validateInklingDocument } from '@/shared/inkling/schema'
import { InlineMathNode } from '@/ui/inkling/editor/article/InlineMathNode'
import {
  $createCodeCardNode,
  $createHorizontalRuleCardNode,
  $createImageCardNode,
  $createMathCardNode,
  $createMusicCardNode,
  $createTableCardNode,
  CodeCardNode,
  HorizontalRuleCardNode,
  ImageCardNode,
  MathCardNode,
  MusicCardNode,
  TableCardNode,
} from '@/ui/inkling/editor/cards/simple-card-nodes'
import { FootnoteRefNode } from '@/ui/inkling/editor/footnotes/FootnoteRefNode'

function buildHeadlessArticleEditor() {
  return createHeadlessEditor({
    namespace: 'inkling-card-insertion-test',
    onError: (error: Error) => {
      // eslint-disable-next-line no-console
      console.error('Headless card insertion test error:', error)
    },
    nodes: [
      ParagraphNode,
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      LinkNode,
      FootnoteRefNode,
      InlineMathNode,
      ImageCardNode,
      CodeCardNode,
      MathCardNode,
      MusicCardNode,
      HorizontalRuleCardNode,
      TableCardNode,
    ],
  })
}

function editorStateToDocument(editorState: { toJSON: () => { root: unknown } }): InklingDocument {
  const serialized = editorState.toJSON()
  return validateInklingDocument({
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: '0.45.0',
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    root: serialized.root as InklingDocument['root'],
  })
}

describe('ui/inkling/editor/cards/insertion', () => {
  it('inserts an image card through a command and asserts serialized output', () => {
    const editor = buildHeadlessArticleEditor()
    editor.update(
      () => {
        const root = $getRoot()
        root.clear()
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode('before'))
        root.append(paragraph)
        const image = $createImageCardNode({
          src: 'https://example.com/img.png',
          alt: 'alt text',
          caption: 'caption text',
          layout: 'left',
          width: 800,
          height: 600,
        })
        root.append(image)
      },
      { discrete: true },
    )

    const document = editorStateToDocument(editor.getEditorState())
    const imageNode = document.root.children[1]
    expect(imageNode?.type).toBe('image-card')
    if (imageNode?.type === 'image-card') {
      expect(imageNode.src).toBe('https://example.com/img.png')
      expect(imageNode.alt).toBe('alt text')
      expect(imageNode.caption).toBe('caption text')
      expect(imageNode.layout).toBe('left')
      expect(imageNode.width).toBe(800)
      expect(imageNode.height).toBe(600)
    }
  })

  it('inserts a code card through a command and asserts serialized output', () => {
    const editor = buildHeadlessArticleEditor()
    editor.update(
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createCodeCardNode({ code: 'console.log("hello")', language: 'js' }))
      },
      { discrete: true },
    )

    const document = editorStateToDocument(editor.getEditorState())
    const codeNode = document.root.children[0]
    expect(codeNode?.type).toBe('code-block')
    if (codeNode?.type === 'code-block') {
      expect(codeNode.code).toBe('console.log("hello")')
      expect(codeNode.language).toBe('js')
    }
  })

  it('inserts a math card through a command and asserts serialized output', () => {
    const editor = buildHeadlessArticleEditor()
    editor.update(
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createMathCardNode({ tex: '\\sum_{i=1}^{n} i', mathml: '<math></math>' }))
      },
      { discrete: true },
    )

    const document = editorStateToDocument(editor.getEditorState())
    const mathNode = document.root.children[0]
    expect(mathNode?.type).toBe('math-block')
    if (mathNode?.type === 'math-block') {
      expect(mathNode.tex).toBe('\\sum_{i=1}^{n} i')
      expect(mathNode.mathml).toBe('<math></math>')
    }
  })

  it('inserts a music card through a command and asserts serialized output', () => {
    const editor = buildHeadlessArticleEditor()
    editor.update(
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createMusicCardNode({ playerId: 'netease-123', auto: true, center: true }))
      },
      { discrete: true },
    )

    const document = editorStateToDocument(editor.getEditorState())
    const musicNode = document.root.children[0]
    expect(musicNode?.type).toBe('music-card')
    if (musicNode?.type === 'music-card') {
      expect(musicNode.playerId).toBe('netease-123')
      expect(musicNode.auto).toBe(true)
      expect(musicNode.center).toBe(true)
    }
  })

  it('inserts a horizontal rule card through a command and asserts serialized output', () => {
    const editor = buildHeadlessArticleEditor()
    editor.update(
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode())
        root.append($createHorizontalRuleCardNode())
      },
      { discrete: true },
    )

    const document = editorStateToDocument(editor.getEditorState())
    expect(document.root.children[1]?.type).toBe('horizontal-rule')
  })

  it('inserts a table card through a command and asserts serialized output', () => {
    const editor = buildHeadlessArticleEditor()
    editor.update(
      () => {
        const root = $getRoot()
        root.clear()
        root.append(
          $createTableCardNode({
            rows: [
              {
                type: 'tablerow',
                version: 1,
                cells: [
                  { type: 'tablecell', version: 1, children: [{ type: 'text', version: 1, text: 'A' }] },
                  { type: 'tablecell', version: 1, children: [{ type: 'text', version: 1, text: 'B' }] },
                ],
              },
            ],
          }),
        )
      },
      { discrete: true },
    )

    const document = editorStateToDocument(editor.getEditorState())
    const tableNode = document.root.children[0]
    expect(tableNode?.type).toBe('table')
    if (tableNode?.type === 'table') {
      expect(tableNode.rows).toHaveLength(1)
      expect(tableNode.rows[0]?.cells).toHaveLength(2)
    }
  })
})
