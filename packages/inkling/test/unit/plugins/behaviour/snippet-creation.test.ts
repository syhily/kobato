import { $createParagraphNode, $createTextNode, $getRoot, $setSelection, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestEditor, updateEditor } from '#/utils/test-editor'
import { $createImageNode, ImageNode } from '@/nodes/ImageNode'
import { createSnippetFromSource, $deriveSnippetValue } from '@/plugins/behaviour/snippet-creation'

interface SnippetArg {
  name: string
  value: string
}

interface SnippetValue {
  nodes: Array<Record<string, unknown>>
}

// the honest-boundary idiom for JSON.parse output (any): narrow through a
// type predicate instead of asserting
function isSnippetValue(value: unknown): value is SnippetValue {
  return typeof value === 'object' && value !== null && 'nodes' in value && Array.isArray(value.nodes)
}

function parseSnippetValue(raw: string): SnippetValue {
  const parsed: unknown = JSON.parse(raw)
  if (!isSnippetValue(parsed)) {
    throw new Error('not a snippet value')
  }
  return parsed
}

describe('snippet creation', () => {
  let editor: LexicalEditor
  let cardKey: string

  beforeEach(async () => {
    editor = createTestEditor({ nodes: [ImageNode], headless: false })
    await updateEditor(editor, () => {
      const card = $createImageNode({ src: '/image.png' })
      cardKey = card.getKey()
      $getRoot().append(card)
    })
  })

  it('derives a whole-card value as { nodes: [exportJSON] }', async () => {
    const createSnippet = vi.fn<(args: SnippetArg) => void>()

    const created = createSnippetFromSource(editor, { kind: 'card', nodeKey: cardKey }, 'My card', createSnippet)

    expect(created).toBe(true)
    expect(createSnippet).toHaveBeenCalledTimes(1)
    const snippet = createSnippet.mock.calls[0][0]
    expect(snippet.name).toBe('My card')
    const value = parseSnippetValue(snippet.value)
    expect(value.nodes).toHaveLength(1)
    expect(value.nodes[0]).toMatchObject({ type: 'image', src: '/image.png' })
  })

  it('derives a selection value through $generateJSONFromSelectedNodes', async () => {
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('Selected text'))
      $getRoot().append(paragraph)
      paragraph.select(0, 8)
    })
    const createSnippet = vi.fn<(args: SnippetArg) => void>()

    const created = createSnippetFromSource(editor, { kind: 'selection' }, 'My selection', createSnippet)

    expect(created).toBe(true)
    const snippet = createSnippet.mock.calls[0][0]
    expect(snippet.name).toBe('My selection')
    expect(parseSnippetValue(snippet.value).nodes.length).toBeGreaterThan(0)
  })

  it('stays open (returns false) when the host port is missing or the name is empty', () => {
    expect(createSnippetFromSource(editor, { kind: 'card', nodeKey: cardKey }, 'Name', undefined)).toBe(false)
    expect(createSnippetFromSource(editor, { kind: 'card', nodeKey: cardKey }, '', vi.fn())).toBe(false)
  })

  it('creates nothing but still closes when the card node is gone', () => {
    const createSnippet = vi.fn()

    const created = createSnippetFromSource(editor, { kind: 'card', nodeKey: 'missing' }, 'Name', createSnippet)

    expect(created).toBe(true)
    expect(createSnippet).not.toHaveBeenCalled()
  })

  it('creates nothing but still closes when there is no selection', async () => {
    await updateEditor(editor, () => {
      $setSelection(null)
    })
    const createSnippet = vi.fn()

    const created = createSnippetFromSource(editor, { kind: 'selection' }, 'Name', createSnippet)

    expect(created).toBe(true)
    expect(createSnippet).not.toHaveBeenCalled()
  })

  it('$deriveSnippetValue returns undefined for an unresolvable source', () => {
    editor.getEditorState().read(() => {
      expect($deriveSnippetValue(editor, { kind: 'card', nodeKey: 'missing' })).toBeUndefined()
    })
  })
})
