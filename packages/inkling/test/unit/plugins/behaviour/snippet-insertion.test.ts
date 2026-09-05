import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isParagraphNode,
  $nodesOfType,
  COMMAND_PRIORITY_NORMAL,
  createEditor,
  type LexicalEditor,
} from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { updateEditor } from '#/utils/test-editor'
import { ImageNode } from '@/nodes/ImageNode'
import { INSERT_CARD_COMMAND } from '@/plugins/behaviour/commands'
import { $insertSnippet, isSnippetDataset } from '@/plugins/behaviour/snippet-insertion'

// One card type is enough to exercise the card fast-path and the
// trailing-paragraph rule in jsdom.
const SNIPPET_TEST_NODES = [ImageNode]

function createTestEditor(): LexicalEditor {
  return createEditor({ namespace: 'test', nodes: SNIPPET_TEST_NODES, onError: () => {} })
}

function seedParagraph(editor: LexicalEditor, text = ''): Promise<void> {
  return updateEditor(editor, () => {
    const paragraph = $createParagraphNode()
    if (text) {
      paragraph.append($createTextNode(text))
    }
    $getRoot().append(paragraph)
    paragraph.select()
  })
}

function insertSnippet(editor: LexicalEditor, dataset: unknown): Promise<boolean> {
  // $insertSnippet owns its update; wrap it so the promise resolves once the
  // commit lands and the following read sees the new state
  return new Promise((resolve) => {
    let inserted = false
    editor.update(
      () => {
        inserted = $insertSnippet(editor, dataset)
      },
      { onUpdate: () => resolve(inserted) },
    )
  })
}

function textSnippet(...texts: string[]): string {
  return JSON.stringify({
    namespace: 'InklingEditor',
    nodes: texts.map((text) => ({
      type: 'paragraph',
      version: 1,
      children: [{ type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' }],
    })),
  })
}

const IMAGE_NODE_SNIPPET = {
  type: 'image',
  version: 1,
  src: 'https://example.com/img.jpg',
  width: 100,
  height: 100,
  title: '',
  alt: 'alt text',
  caption: '',
  cardWidth: 'regular',
  href: '',
}

function snippetValue(nodes: Record<string, unknown>[]): string {
  return JSON.stringify({ namespace: 'InklingEditor', nodes })
}

describe('isSnippetDataset', () => {
  it('accepts a { name, value } string pair', () => {
    expect(isSnippetDataset({ name: 'planes', value: '{}' })).toBe(true)
  })

  it('rejects non-objects and non-string fields', () => {
    expect(isSnippetDataset(null)).toBe(false)
    expect(isSnippetDataset(undefined)).toBe(false)
    expect(isSnippetDataset('planes')).toBe(false)
    expect(isSnippetDataset(42)).toBe(false)
    expect(isSnippetDataset({})).toBe(false)
    expect(isSnippetDataset({ name: 'planes' })).toBe(false)
    expect(isSnippetDataset({ value: '{}' })).toBe(false)
    expect(isSnippetDataset({ name: 42, value: '{}' })).toBe(false)
    expect(isSnippetDataset({ name: 'planes', value: 42 })).toBe(false)
  })
})

describe('$insertSnippet', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor()
  })

  it('inserts a multi-node snippet at the selection', async () => {
    await seedParagraph(editor)

    const inserted = await insertSnippet(editor, { name: 'greeting', value: textSnippet('Hello', 'world') })

    expect(inserted).toBe(true)
    editor.getEditorState().read(() => {
      const root = $getRoot()
      expect(root.getTextContent()).toBe('Hello\n\nworld')
      expect(root.getChildren().every($isParagraphNode)).toBe(true)
    })
  })

  it('appends a trailing paragraph when the snippet ends in a card', async () => {
    await seedParagraph(editor)

    const inserted = await insertSnippet(editor, {
      name: 'card-tail',
      value: snippetValue([
        {
          type: 'paragraph',
          version: 1,
          children: [{ type: 'text', version: 1, text: 'intro', format: 0, detail: 0, mode: 'normal', style: '' }],
        },
        IMAGE_NODE_SNIPPET,
      ]),
    })

    expect(inserted).toBe(true)
    editor.getEditorState().read(() => {
      // exact top-level structure: the intro paragraph, the card, and the
      // appended trailing paragraph — a leftover seed paragraph anywhere
      // would make this four children, so the paragraph after the card can
      // only have come from the trailing-paragraph rule
      const children = $getRoot().getChildren()
      expect(children).toHaveLength(3)
      expect($isParagraphNode(children[0])).toBe(true)
      expect(children[0].getTextContent()).toBe('intro')
      expect(children[1]).toBeInstanceOf(ImageNode)
      expect($isParagraphNode(children[2])).toBe(true)
      expect(children[2].getTextContent()).toBe('')
    })
  })

  it('routes a single-card snippet through INSERT_CARD_COMMAND instead of inserting directly', async () => {
    await seedParagraph(editor)
    const onInsertCard = vi.fn().mockReturnValue(true)
    editor.registerCommand(INSERT_CARD_COMMAND, onInsertCard, COMMAND_PRIORITY_NORMAL)

    const inserted = await insertSnippet(editor, { name: 'cover', value: snippetValue([IMAGE_NODE_SNIPPET]) })

    expect(inserted).toBe(true)
    expect(onInsertCard).toHaveBeenCalledTimes(1)
    const payload = onInsertCard.mock.calls[0][0]
    expect(payload.cardNode).toBeInstanceOf(ImageNode)
    // delegated, not generically inserted: the editor itself holds no card
    editor.getEditorState().read(() => {
      expect($nodesOfType(ImageNode)).toHaveLength(0)
    })
  })

  it('no-ops on a malformed snippet value', async () => {
    await seedParagraph(editor, 'keep')

    const inserted = await insertSnippet(editor, { name: 'broken', value: '{not json' })

    expect(inserted).toBe(false)
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe('keep')
      expect($getRoot().getChildrenSize()).toBe(1)
    })
  })

  it('no-ops when the node list contains non-node entries', async () => {
    // { nodes: [42] } slips past an Array.isArray-only guard and throws inside
    // $generateNodesFromSerializedNodes — a malformed snippet must no-op
    // silently instead of surfacing an editor error
    const errors: Error[] = []
    const strictEditor = createEditor({
      namespace: 'test',
      nodes: SNIPPET_TEST_NODES,
      onError: (error) => errors.push(error),
    })
    await seedParagraph(strictEditor, 'keep')

    const inserted = await insertSnippet(strictEditor, { name: 'broken', value: '{"nodes":[42]}' })

    expect(inserted).toBe(false)
    expect(errors).toEqual([])
    strictEditor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe('keep')
      expect($getRoot().getChildrenSize()).toBe(1)
    })
  })

  it('no-ops when a node entry carries an unregistered type', async () => {
    // a string type passes the shape guard but fails generation when the
    // editor has no class registered for it (dev warns, then throws on the
    // missing registeredNode) — host data must no-op, not surface an error
    const errors: Error[] = []
    const strictEditor = createEditor({
      namespace: 'test',
      nodes: SNIPPET_TEST_NODES,
      onError: (error) => errors.push(error),
    })
    await seedParagraph(strictEditor, 'keep')

    const inserted = await insertSnippet(strictEditor, { name: 'broken', value: '{"nodes":[{"type":"no-such-node"}]}' })

    expect(inserted).toBe(false)
    expect(errors).toEqual([])
    strictEditor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe('keep')
      expect($getRoot().getChildrenSize()).toBe(1)
    })
  })

  it('no-ops when the value parses but carries no node list', async () => {
    await seedParagraph(editor, 'keep')

    const inserted = await insertSnippet(editor, { name: 'empty', value: '{"foo":1}' })

    expect(inserted).toBe(false)
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe('keep')
      expect($getRoot().getChildrenSize()).toBe(1)
    })
  })

  it('rejects non-snippet datasets without touching the editor', async () => {
    await seedParagraph(editor, 'keep')

    expect($insertSnippet(editor, null)).toBe(false)
    expect($insertSnippet(editor, 'planes')).toBe(false)
    expect($insertSnippet(editor, { value: 42 })).toBe(false)

    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe('keep')
      expect($getRoot().getChildrenSize()).toBe(1)
    })
  })
})
