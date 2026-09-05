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

import type { FootnoteHandle } from '@/plugins/behaviour/footnoteHandle'

import { drainEnqueuedUpdates } from '#/utils/test-editor'
import DEFAULT_NODES from '@/nodes/DefaultNodes'
import { $createFootnoteRefNode, $isFootnoteRefNode } from '@/nodes/footnote/FootnoteRefNode'
import { $createFootnoteDefinitionNode } from '@/nodes/FootnoteDefinitionNode'
import { createFootnoteHandle } from '@/plugins/behaviour/footnoteHandle'
import {
  $collectFootnoteSnapshot,
  $footnoteSyncSignature,
  $removeFootnote,
  $syncFootnoteIndices,
  registerFootnotes,
} from '@/plugins/behaviour/footnotes'

// The footnote behaviour module — pins
// for the renumber engine (kobato's footnote-sync matrix, table-driven), the
// signature short-circuit, the caret trigger (with backslash suppression and
// the table-cell guard), the doc-end-run transform, and `$removeFootnote`.
// The undo-merge pin lives in test/unit/plugins/FootnotePlugin.test.tsx (it
// needs a real history stack); the export byte contract in
// test/unit/html/footnote-export.test.ts.

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

// Builds a document from data: paragraphs of text/ref parts and definition
// cards, in the given order. Construction order is NOT normalized — the
// run transform is only exercised when registerFootnotes is in play.
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

/** Refs in document order as `text→targetKey`. */
function readRefs(editor: LexicalEditor): string[] {
  return editor
    .getEditorState()
    .read(() => $collectFootnoteSnapshot().refs.map((ref) => `${ref.getTextContent()}→${ref.targetKey}`))
}

/** Definition targetKeys in document order. */
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

    // keyB is cited first → 1; keyA second → 2 (both occurrences renumbered)
    expect(readRefs(editor)).toEqual(['1→keyB', '2→keyA', '2→keyA'])
    // the run reorders to citation order
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
    // cited first, then the orphans in their stored order (C before B)
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

    // nothing is touched: prose-only round-trips keep their digits
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

    // irrelevant: typing elsewhere in the prose
    await drainEnqueuedUpdates(editor, () => {
      $getRoot().getLastChild()?.insertBefore($createParagraphNode())
    })
    expect(await signature()).toBe(base)

    // relevant: a ref digit changed (e.g. a paste wrote its own number)
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

    // move the keyB paragraph ahead of the keyA one: same texts, same
    // definitions, different citation order
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

  // Registration precedes content — the production order (the plugin mounts
  // with the composer) and the order every other test here uses. Registering
  // a transform on an ALREADY non-empty editor makes Lexical 0.46 schedule a
  // 'history-merge'-tagged mark-dirty commit as a microtask, and a
  // synchronous edit in between inherits the tag and gets gate-skipped
  // (upstream quirk; RestrictContentPlugin's RootNode transform has it too).
  beforeEach(() => {
    editor = createTestEditor()
    handle = createFootnoteHandle()
    registerFootnotes(editor, handle)
  })

  it('publishes when the signature flips and short-circuits unchanged signatures', async () => {
    // the buildDoc commit settles the scan: first publish of the maps
    await drainEnqueuedUpdates(editor, () => {
      $buildDoc([
        { kind: 'p', parts: [{ ref: '1', cites: 'keyA' }, ' prose'] },
        { kind: 'def', targetKey: 'keyA' },
      ])
    })
    expect(handle.getState().indices).toEqual({ keyA: 1 })

    const publishSpy = vi.spyOn(handle, 'publishMaps')

    // a renumber-irrelevant commit: same signature → no re-publish
    await drainEnqueuedUpdates(editor, () => {
      const first = $getRoot().getFirstChild()
      if ($isParagraphNode(first)) {
        first.append($createTextNode('x'))
      }
    })
    expect(publishSpy).not.toHaveBeenCalled()

    // a relevant commit (a paste wrote its own digit): the engine runs and
    // re-publishes — the digit is renumbered straight back
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

    // cite keyB ahead of keyA: the scan's engine renumbers both rows
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

  // Types text at the current collapsed caret through the public selection API.
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

    // the trigger text is consumed; the prose keeps its trailing space
    editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChild()
      expect(paragraph?.getTextContent()).toBe('hello 1')
    })

    // the focus handoff targets the fresh definition
    expect(handle.getState().focusRequest?.targetKey).toBe(definition)
  })

  it('`^ ` at line start triggers', async () => {
    // a fresh empty paragraph: the caret sits at the line start
    await drainEnqueuedUpdates(editor, () => {
      const paragraph = $createParagraphNode()
      $getRoot().getFirstChild()?.insertAfter(paragraph)
      paragraph.select()
    })
    await typeText('^ ')

    const { refs, definitions } = readFootnotes()
    expect(refs).toHaveLength(1)
    expect(definitions).toHaveLength(1)
    // the paragraph holds only the ref now
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
      // the fresh paragraph must land before the definition run
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
    // what Lexical's nested-composer machinery sets; the guard reads it
    // through getParentEditor (src/utils/lexical-internals.ts)
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
