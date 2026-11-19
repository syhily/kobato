import type { FootnoteHandle } from '@kobato/inkling-internal/plugins/behaviour/footnote-handle'

import DEFAULT_NODES from '@kobato/inkling-internal/nodes/DefaultNodes'
import { $createFootnoteRefNode, $isFootnoteRefNode } from '@kobato/inkling-internal/nodes/footnote/FootnoteRefNode'
import { $createFootnoteDefinitionNode } from '@kobato/inkling-internal/nodes/FootnoteDefinitionNode'
import { createFootnoteHandle } from '@kobato/inkling-internal/plugins/behaviour/footnote-handle'
import {
  $collectFootnoteSnapshot,
  $footnoteSyncSignature,
  $removeFootnote,
  $syncFootnoteIndices,
  registerFootnotes,
} from '@kobato/inkling-internal/plugins/behaviour/footnotes'
import { drainEnqueuedUpdates } from '@kobato/inkling/tests/utils/test-editor'
import { createHeadlessEditor } from '@lexical/headless'
import { $createTableCellNode, $createTableNode, $createTableRowNode, TableCellHeaderStates } from '@lexical/table'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  type LexicalEditor,
} from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function createTestEditor(nodes: typeof DEFAULT_NODES = DEFAULT_NODES): LexicalEditor {
  return createHeadlessEditor({
    namespace: 'test',
    nodes,
    onError: (error) => {
      throw error
    },
  })
}

type DocEntry =
  | { kind: 'p'; parts: Array<string | { ref: string; cites: string }> }
  | { kind: 'def'; targetKey: string; content?: string }

function $buildDoc(entries: DocEntry[]): void {
  const root = $getRoot()
  for (const entry of entries) {
    if (entry.kind === 'def') {
      root.append($createFootnoteDefinitionNode({ targetKey: entry.targetKey, content: entry.content ?? '' }))
      continue
    }
    const paragraph = $createParagraphNode()
    for (const part of entry.parts) {
      paragraph.append(typeof part === 'string' ? $createTextNode(part) : $createFootnoteRefNode(part.ref, part.cites))
    }
    root.append(paragraph)
  }
}

function readRefs(editor: LexicalEditor): string[] {
  return editor
    .getEditorState()
    .read(() => $collectFootnoteSnapshot().refs.map((ref) => `${ref.getTextContent()}→${ref.targetKey}`))
}

function readDefinitionOrder(editor: LexicalEditor): string[] {
  return editor
    .getEditorState()
    .read(() => $collectFootnoteSnapshot().definitions.map((definition) => definition.targetKey))
}

describe('$syncFootnoteIndices (the renumber engine)', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor()
  })

  it('numbers refs by first-citation order and reorders the definition run to match', async () => {
    await drainEnqueuedUpdates(editor, () => {
      $buildDoc([
        { kind: 'p', parts: [{ ref: '9', cites: 'keyB' }] },
        {
          kind: 'p',
          parts: [
            { ref: '9', cites: 'keyA' },
            { ref: '9', cites: 'keyA' },
          ],
        },
        { kind: 'def', targetKey: 'keyA' },
        { kind: 'def', targetKey: 'keyB' },
      ])
      $syncFootnoteIndices()
    })

    expect(readRefs(editor)).toEqual(['1→keyB', '2→keyA', '2→keyA'])

    expect(readDefinitionOrder(editor)).toEqual(['keyB', 'keyA'])
  })
  it('tails orphan definitions after the cited ones, keeping their stored order', async () => {
    await drainEnqueuedUpdates(editor, () => {
      $buildDoc([
        { kind: 'p', parts: [{ ref: '9', cites: 'keyA' }] },
        { kind: 'def', targetKey: 'keyC' },
        { kind: 'def', targetKey: 'keyA' },
        { kind: 'def', targetKey: 'keyB' },
      ])
      $syncFootnoteIndices()
    })

    expect(readRefs(editor)).toEqual(['1→keyA'])

    expect(readDefinitionOrder(editor)).toEqual(['keyA', 'keyC', 'keyB'])
  })

  it('skips the whole sync when a ref targets a missing definition', async () => {
    await drainEnqueuedUpdates(editor, () => {
      $buildDoc([
        { kind: 'p', parts: [{ ref: '9', cites: 'missing' }] },
        { kind: 'def', targetKey: 'keyA' },
      ])
      $syncFootnoteIndices()
    })

    expect(readRefs(editor)).toEqual(['9→missing'])
    expect(readDefinitionOrder(editor)).toEqual(['keyA'])
  })

  it('skips when there are no definitions at all', async () => {
    await drainEnqueuedUpdates(editor, () => {
      $buildDoc([{ kind: 'p', parts: [{ ref: '3', cites: 'keyA' }] }])
      $syncFootnoteIndices()
    })

    expect(readRefs(editor)).toEqual(['3→keyA'])
  })

  it('keeps a synced document untouched (idempotent)', async () => {
    await drainEnqueuedUpdates(editor, () => {
      $buildDoc([
        { kind: 'p', parts: [{ ref: '1', cites: 'keyA' }, ' text ', { ref: '2', cites: 'keyB' }] },
        { kind: 'def', targetKey: 'keyA' },
        { kind: 'def', targetKey: 'keyB' },
      ])
      $syncFootnoteIndices()
    })

    expect(readRefs(editor)).toEqual(['1→keyA', '2→keyB'])
    expect(readDefinitionOrder(editor)).toEqual(['keyA', 'keyB'])
  })
})

describe('$footnoteSyncSignature (the short-circuit)', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor()
  })

  async function signature(): Promise<string> {
    return editor.getEditorState().read(() => $footnoteSyncSignature($collectFootnoteSnapshot()))
  }

  it('is unchanged by renumber-irrelevant edits and flipped by relevant ones', async () => {
    let refAKey = ''
    await drainEnqueuedUpdates(editor, () => {
      $buildDoc([
        { kind: 'p', parts: [{ ref: '1', cites: 'keyA' }, ' prose ', { ref: '2', cites: 'keyB' }] },
        { kind: 'def', targetKey: 'keyA' },
        { kind: 'def', targetKey: 'keyB' },
      ])
      refAKey = $collectFootnoteSnapshot().refs[0].getKey()
    })
    const base = await signature()

    await drainEnqueuedUpdates(editor, () => {
      $getRoot().getLastChild()?.insertBefore($createParagraphNode())
    })
    expect(await signature()).toBe(base)

    await drainEnqueuedUpdates(editor, () => {
      const ref = $collectFootnoteSnapshot().refs.find((node) => node.getKey() === refAKey)
      ref?.setTextContent('7')
    })
    expect(await signature()).not.toBe(base)
  })

  it('flips when citation order changes even with the same digits', async () => {
    await drainEnqueuedUpdates(editor, () => {
      $buildDoc([
        { kind: 'p', parts: [{ ref: '1', cites: 'keyA' }] },
        { kind: 'p', parts: [{ ref: '2', cites: 'keyB' }] },
        { kind: 'def', targetKey: 'keyA' },
        { kind: 'def', targetKey: 'keyB' },
      ])
    })
    const base = await signature()

    await drainEnqueuedUpdates(editor, () => {
      const first = $getRoot().getFirstChild()
      const second = first?.getNextSibling()
      if (first && second) {
        second.remove()
        first.insertBefore(second)
      }
    })
    expect(await signature()).not.toBe(base)
  })
})

describe('the registered renumber scan', () => {
  let editor: LexicalEditor
  let handle: FootnoteHandle

  beforeEach(() => {
    editor = createTestEditor()
    handle = createFootnoteHandle()
    registerFootnotes(editor, handle)
  })
  it('publishes when the signature flips and short-circuits unchanged signatures', async () => {
    await drainEnqueuedUpdates(editor, () => {
      $buildDoc([
        { kind: 'p', parts: [{ ref: '1', cites: 'keyA' }, ' prose'] },
        { kind: 'def', targetKey: 'keyA' },
      ])
    })
    expect(handle.getState().indices).toEqual({ keyA: 1 })

    const publishSpy = vi.spyOn(handle, 'publishMaps')

    await drainEnqueuedUpdates(editor, () => {
      const first = $getRoot().getFirstChild()
      if ($isParagraphNode(first)) {
        first.append($createTextNode('x'))
      }
    })
    expect(publishSpy).not.toHaveBeenCalled()

    await drainEnqueuedUpdates(editor, () => {
      $collectFootnoteSnapshot().refs[0].setTextContent('7')
    })
    expect(publishSpy).toHaveBeenCalledTimes(1)
    expect(readRefs(editor)).toEqual(['1→keyA'])
  })

  it('renumbers after a renumber-relevant commit', async () => {
    await drainEnqueuedUpdates(editor, () => {
      $buildDoc([
        { kind: 'p', parts: [{ ref: '1', cites: 'keyA' }] },
        { kind: 'def', targetKey: 'keyA' },
        { kind: 'def', targetKey: 'keyB' },
      ])
    })

    await drainEnqueuedUpdates(editor, () => {
      const first = $getRoot().getFirstChild()
      const paragraph = $createParagraphNode()
      paragraph.append($createFootnoteRefNode('9', 'keyB'))
      first?.insertBefore(paragraph)
    })

    expect(readRefs(editor)).toEqual(['1→keyB', '2→keyA'])
    expect(readDefinitionOrder(editor)).toEqual(['keyB', 'keyA'])
    expect(handle.getState().indices).toEqual({ keyB: 1, keyA: 2 })
  })
})

describe('the caret trigger scan', () => {
  let editor: LexicalEditor
  let handle: FootnoteHandle

  beforeEach(async () => {
    editor = createTestEditor()
    handle = createFootnoteHandle()
    registerFootnotes(editor, handle)
    await drainEnqueuedUpdates(editor, () => {
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('hello'))
      $getRoot().append(paragraph)
      paragraph.selectEnd()
    })
  })

  async function typeText(text: string): Promise<void> {
    await drainEnqueuedUpdates(editor, () => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        selection.insertText(text)
      }
    })
  }

  function readFootnotes(): { refs: string[]; definitions: string[] } {
    return { refs: readRefs(editor), definitions: readDefinitionOrder(editor) }
  }

  it('`^ ` after a word inserts the ref and the definition, and files the focus handoff', async () => {
    await typeText(' ^ ')

    const { refs, definitions } = readFootnotes()
    expect(refs).toHaveLength(1)
    expect(definitions).toHaveLength(1)
    const [ref] = refs
    const [definition] = definitions
    expect(ref).toBe(`1→${definition}`)

    editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChild()
      expect(paragraph?.getTextContent()).toBe('hello 1')
    })

    expect(handle.getState().focusRequest?.targetKey).toBe(definition)
  })

  it('`^ ` at line start triggers', async () => {
    await drainEnqueuedUpdates(editor, () => {
      const paragraph = $createParagraphNode()
      $getRoot().getFirstChild()?.insertAfter(paragraph)
      paragraph.select()
    })
    await typeText('^ ')
    const { refs, definitions } = readFootnotes()
    expect(refs).toHaveLength(1)
    expect(definitions).toHaveLength(1)

    editor.getEditorState().read(() => {
      const paragraphs = $getRoot()
        .getChildren()
        .filter((node) => node.getType() === 'paragraph')
      expect(paragraphs[1]?.getTextContent()).toBe('1')
    })
  })

  it('`a^ ` does not trigger (the spec tightens kobato to a word boundary)', async () => {
    await typeText('a^ ')

    expect(readFootnotes().refs).toHaveLength(0)
    editor.getEditorState().read(() => {
      expect($getRoot().getFirstChild()?.getTextContent()).toBe('helloa^ ')
    })
  })

  it('`\\^ ` does not trigger (kobato backslash suppression)', async () => {
    await typeText(' \\^ ')

    expect(readFootnotes().refs).toHaveLength(0)
  })

  it('does not trigger inside a table cell', async () => {
    await drainEnqueuedUpdates(editor, () => {
      const cell = $createTableCellNode(TableCellHeaderStates.NO_STATUS)
      const cellParagraph = $createParagraphNode()
      cellParagraph.append($createTextNode('in a cell'))
      cell.append(cellParagraph)
      const row = $createTableRowNode()
      row.append(cell)
      const table = $createTableNode()
      table.append(row)
      $getRoot().append(table)
      cellParagraph.selectEnd()
    })

    await typeText(' ^ ')

    expect(readFootnotes().refs).toHaveLength(0)
  })

  it('assigns the next distinct index to a second footnote', async () => {
    await typeText(' ^ ')
    await drainEnqueuedUpdates(editor, () => {
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('again'))

      $getRoot().getFirstChild()?.insertAfter(paragraph)
      paragraph.selectEnd()
    })
    await typeText(' ^ ')

    const { refs, definitions } = readFootnotes()
    expect(refs).toHaveLength(2)
    expect(definitions).toHaveLength(2)
    expect(refs[0]).toBe(`1→${definitions[0]}`)
    expect(refs[1]).toBe(`2→${definitions[1]}`)
  })
})

describe('the doc-end run transform', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor()
    registerFootnotes(editor, createFootnoteHandle())
  })

  function rootChildTypes(): string[] {
    return editor.getEditorState().read(() =>
      $getRoot()
        .getChildren()
        .map((node) => node.getType()),
    )
  }

  it('moves a mid-document definition back to the end', async () => {
    await drainEnqueuedUpdates(editor, () => {
      $buildDoc([
        { kind: 'p', parts: ['before'] },
        { kind: 'def', targetKey: 'keyA' },
        { kind: 'p', parts: ['after'] },
      ])
    })

    expect(rootChildTypes()).toEqual(['paragraph', 'paragraph', 'footnotedefinition'])
  })

  it('pulls a paragraph appended after the run back before it', async () => {
    await drainEnqueuedUpdates(editor, () => {
      $buildDoc([
        { kind: 'p', parts: ['prose'] },
        { kind: 'def', targetKey: 'keyA' },
        { kind: 'def', targetKey: 'keyB' },
      ])
    })
    await drainEnqueuedUpdates(editor, () => {
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('trailing'))
      $getRoot().append(paragraph)
    })

    expect(rootChildTypes()).toEqual(['paragraph', 'paragraph', 'footnotedefinition', 'footnotedefinition'])
  })
})

describe('$removeFootnote', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor()
  })

  it('removes the definition and every ref citing it, leaving other footnotes alone', async () => {
    await drainEnqueuedUpdates(editor, () => {
      $buildDoc([
        { kind: 'p', parts: [{ ref: '1', cites: 'keyA' }, ' and ', { ref: '2', cites: 'keyB' }] },
        { kind: 'p', parts: [{ ref: '1', cites: 'keyA' }] },
        { kind: 'def', targetKey: 'keyA' },
        { kind: 'def', targetKey: 'keyB' },
      ])
    })

    let removed = false
    await drainEnqueuedUpdates(editor, () => {
      removed = $removeFootnote('keyA')
    })

    expect(removed).toBe(true)
    expect(readRefs(editor)).toEqual(['2→keyB'])
    expect(readDefinitionOrder(editor)).toEqual(['keyB'])
  })

  it('returns false for an empty or unknown targetKey', async () => {
    await drainEnqueuedUpdates(editor, () => {
      $buildDoc([
        { kind: 'p', parts: [{ ref: '1', cites: 'keyA' }] },
        { kind: 'def', targetKey: 'keyA' },
      ])
    })

    const results: boolean[] = []
    await drainEnqueuedUpdates(editor, () => {
      results.push($removeFootnote(''), $removeFootnote('nope'))
    })

    expect(results).toEqual([false, false])
    expect(readDefinitionOrder(editor)).toEqual(['keyA'])
  })
})

describe('registration guards', () => {
  it('no-ops on an editor without the footnote node pair', async () => {
    const bare = createHeadlessEditor({
      namespace: 'test',
      onError: (error) => {
        throw error
      },
    })
    const handle = createFootnoteHandle()
    registerFootnotes(bare, handle)

    await drainEnqueuedUpdates(bare, () => {
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('plain ^ '))
      $getRoot().append(paragraph)
    })

    expect(bare.getEditorState().read(() => $getRoot().getTextContent())).toBe('plain ^ ')
    expect(handle.getState().indices).toEqual({})
  })

  it('no-ops on a nested editor (the reviewed v1 gap)', async () => {
    const editor = createTestEditor()
    const nested = createTestEditor()

    ;(nested as unknown as { _parentEditor: LexicalEditor })._parentEditor = editor
    const handle = createFootnoteHandle()
    registerFootnotes(nested, handle)

    await drainEnqueuedUpdates(nested, () => {
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('nested ^ '))
      $getRoot().append(paragraph)
    })

    expect(nested.getEditorState().read(() => $getRoot().getTextContent())).toBe('nested ^ ')
  })
})

describe('word-count semantics', () => {
  it('the ref digit is text content — it counts, matching kobato', async () => {
    const editor = createTestEditor()
    await drainEnqueuedUpdates(editor, () => {
      $buildDoc([
        { kind: 'p', parts: ['hello', { ref: '1', cites: 'keyA' }] },
        { kind: 'def', targetKey: 'keyA' },
      ])
    })

    editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChild()
      expect(paragraph?.getTextContent()).toBe('hello1')
    })
  })
})

describe('FootnoteRefNode entity behaviour', () => {
  it('is atomic: text cannot be typed into it, and it serializes its targetKey', async () => {
    const editor = createTestEditor()
    await drainEnqueuedUpdates(editor, () => {
      $buildDoc([{ kind: 'p', parts: [{ ref: '1', cites: 'keyA' }] }])
    })

    editor.getEditorState().read(() => {
      const ref = $collectFootnoteSnapshot().refs[0]
      expect($isFootnoteRefNode(ref)).toBe(true)
      expect(ref.isTextEntity()).toBe(true)
      expect(ref.canInsertTextBefore()).toBe(false)
      expect(ref.canInsertTextAfter()).toBe(false)
      expect(ref.exportJSON()).toMatchObject({ type: 'footnote-ref', targetKey: 'keyA', text: '1' })
    })
  })
})
