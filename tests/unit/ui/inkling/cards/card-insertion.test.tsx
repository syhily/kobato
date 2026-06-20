import { createHeadlessEditor } from '@lexical/headless'
import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { $getRoot, $createParagraphNode, $createTextNode, ParagraphNode } from 'lexical'
import { describe, expect, it } from 'vitest'

import type { InklingDocument } from '@/shared/inkling/schema'

import { validateInklingDocument } from '@/shared/inkling/schema'
import { InlineMathNode } from '@/ui/inkling/editor/article/InlineMathNode'
import { INKLING_CARD_MENU_ITEMS } from '@/ui/inkling/editor/cards/card-registry'
import { SolutionCardNode, TwoColumnCardNode } from '@/ui/inkling/editor/cards/layout-card-nodes'
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
      SolutionCardNode,
      TwoColumnCardNode,
    ],
  })
}

function editorStateToDocument(editorState: { toJSON: () => { root: unknown } }): InklingDocument {
  const serialized = editorState.toJSON()
  return validateInklingDocument({
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: '0.45.0',
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

// Regression tests for the card-registry `insert` handlers. These exercise
// the real slash-menu / toolbar insertion path (unlike the tests above,
// which call `$create*CardNode` + `root.append` directly and so bypass the
// handler). The handlers previously called `.selectPrevious()` on a
// detached node, which throws inside Lexical's `getParentOrThrow()` and
// silently aborted every card insertion; these tests pin the fix.
describe('ui/inkling/editor/cards/card-registry insert handlers', () => {
  // Build an editor with a single empty paragraph and place the caret in it,
  // then run every article-mode card insert handler and assert the card
  // actually lands in the document tree (not silently dropped).
  function insertAndSerialize(type: string): InklingDocument {
    const editor = buildHeadlessArticleEditor()
    editor.update(
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode())
      },
      { discrete: true },
    )

    const item = INKLING_CARD_MENU_ITEMS.find((entry) => entry.type === type)
    expect(item).toBeDefined()
    item!.insert(editor)

    return editorStateToDocument(editor.getEditorState())
  }

  it('attaches an image card via the registry insert handler', () => {
    const document = insertAndSerialize('image-card')
    expect(document.root.children.some((child) => child.type === 'image-card')).toBe(true)
  })

  it('attaches a code card via the registry insert handler', () => {
    const document = insertAndSerialize('code-block')
    expect(document.root.children.some((child) => child.type === 'code-block')).toBe(true)
  })

  it('attaches a math card via the registry insert handler', () => {
    const document = insertAndSerialize('math-block')
    expect(document.root.children.some((child) => child.type === 'math-block')).toBe(true)
  })

  it('attaches a music card via the registry insert handler with a non-empty playerId', () => {
    // The handler seeds `playerId: '__pending__'` because the schema requires
    // `playerId.min(1)` — an empty string would make the document fail
    // `validateInklingDocument` and stall autosave (see OnInklingDocumentChangePlugin).
    const document = insertAndSerialize('music-card')
    const music = document.root.children.find(
      (child): child is Extract<(typeof document.root.children)[number], { type: 'music-card' }> =>
        child.type === 'music-card',
    )
    expect(music).toBeDefined()
    expect(music!.playerId.length).toBeGreaterThan(0)
  })

  it('attaches a horizontal-rule card via the registry insert handler', () => {
    const document = insertAndSerialize('horizontal-rule')
    expect(document.root.children.some((child) => child.type === 'horizontal-rule')).toBe(true)
  })

  it('attaches a table card via the registry insert handler', () => {
    const document = insertAndSerialize('table')
    const table = document.root.children.find(
      (child): child is Extract<(typeof document.root.children)[number], { type: 'table' }> => child.type === 'table',
    )
    expect(table).toBeDefined()
    expect(table!.rows).toHaveLength(2)
    expect(table!.rows[0]?.cells).toHaveLength(2)
  })

  it('attaches a solution card via the registry insert handler', () => {
    const document = insertAndSerialize('solution')
    expect(document.root.children.some((child) => child.type === 'solution')).toBe(true)
  })

  it('attaches a two-column card via the registry insert handler', () => {
    const document = insertAndSerialize('two-column')
    expect(document.root.children.some((child) => child.type === 'two-column')).toBe(true)
  })

  it('appends a trailing paragraph after the card so the caret can land past it', () => {
    const document = insertAndSerialize('horizontal-rule')
    // children: [paragraph (original, now split), horizontal-rule, trailing paragraph]
    const last = document.root.children[document.root.children.length - 1]
    expect(last?.type).toBe('paragraph')
  })
})

// Regression tests for `isKeyboardSelectable()`. Without this override,
// Lexical never enters a `NodeSelection` on a DecoratorNode, so click-to-
// select, the selection outline, the drag handle, and arrow-key navigation
// across cards all silently fail. Pin the override on every article card.
describe('ui/inkling/editor/cards isKeyboardSelectable', () => {
  it('every article card node reports isKeyboardSelectable() = true', () => {
    const editor = buildHeadlessArticleEditor()
    editor.update(
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode())
      },
      { discrete: true },
    )

    const cardCreators = [
      () => $createImageCardNode({ src: '', alt: '', caption: '', layout: 'center' }),
      () => $createCodeCardNode({ code: '' }),
      () => $createMathCardNode({ tex: '' }),
      () => $createMusicCardNode({ playerId: '__pending__' }),
      () => $createHorizontalRuleCardNode(),
      () =>
        $createTableCardNode({
          rows: [{ type: 'tablerow', version: 1, cells: [{ type: 'tablecell', version: 1, children: [] }] }],
        }),
    ]

    for (const create of cardCreators) {
      let selectable = false
      editor.update(
        () => {
          const node = create()
          $getRoot().append(node)
          selectable = node.isKeyboardSelectable()
        },
        { discrete: true },
      )
      expect(selectable).toBe(true)
    }
  })
})
