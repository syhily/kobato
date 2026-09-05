import { createHeadlessEditor } from '@lexical/headless'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  type LexicalEditor,
} from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { updateEditor } from '#/utils/test-editor'
import { $replaceDashes } from '@/plugins/behaviour/em-en-dash'

// Synchronous test table for the em/en dash grammar
// (@/plugins/behaviour/em-en-dash) — em/en replacement, boundary guards,
// the HR-shortcut exemption, and caret offset adjustment, pinned by calling
// the scan body directly on a headless editor. The registration wiring
// (update-scan seam, 'history-push' tag, undo) stays in
// test/unit/plugins/EmEnDashPlugin.test.tsx.

function createTestEditor(): LexicalEditor {
  return createHeadlessEditor({
    namespace: 'test',
    nodes: [],
    onError: (error) => {
      throw error
    },
  })
}

interface ScanCase {
  name: string
  input: string
  // collapsed caret offset before the scan; defaults to end of input
  caret?: number
  supportsHrShortcut?: boolean
  expected: string
  expectedCaret: number
}

// Awaits the commit like the neighboring behaviour tests do — headless
// updates flush on a deferred callback, not synchronously.
async function runScan(
  editor: LexicalEditor,
  { input, caret = input.length, supportsHrShortcut = false }: Omit<ScanCase, 'name' | 'expected' | 'expectedCaret'>,
): Promise<{ text: string; caretOffset: number | null }> {
  await updateEditor(editor, () => {
    const paragraph = $createParagraphNode()
    const text = $createTextNode(input)
    paragraph.append(text)
    $getRoot().append(paragraph)
    text.select(caret, caret)
    $replaceDashes(new Set([text.getKey()]), supportsHrShortcut)
  })
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    return {
      text: $getRoot().getTextContent(),
      caretOffset: $isRangeSelection(selection) ? selection.anchor.offset : null,
    }
  })
}

const cases: ScanCase[] = [
  // em dash
  { name: 'replaces three dashes with an em dash', input: '---', expected: '—', expectedCaret: 1 },
  { name: 'replaces three dashes mid-text', input: 'a---b', expected: 'a—b', expectedCaret: 3 },
  { name: 'replaces three dashes after text', input: 'ab---', expected: 'ab—', expectedCaret: 3 },
  // em dash boundary guards: a run longer than three dashes never matches
  { name: 'leaves four consecutive dashes alone', input: '----', expected: '----', expectedCaret: 4 },
  { name: 'leaves five consecutive dashes alone', input: '-----', expected: '-----', expectedCaret: 5 },
  // en dash: non-dash char + '--' + whitespace
  {
    name: 'replaces two dashes followed by whitespace with an en dash',
    input: 'a-- ',
    expected: 'a– ',
    expectedCaret: 3,
  },
  { name: 'replaces two dashes followed by a tab with an en dash', input: 'a--\t', expected: 'a–\t', expectedCaret: 3 },
  { name: 'replaces two dashes followed by whitespace mid-text', input: 'a-- b', expected: 'a– b', expectedCaret: 4 },
  // en dash boundary guards
  { name: 'leaves two dashes at paragraph start alone', input: '-- ', expected: '-- ', expectedCaret: 3 },
  { name: 'leaves two dashes without trailing whitespace alone', input: 'a--', expected: 'a--', expectedCaret: 3 },
  { name: 'leaves two dashes followed by a non-space char alone', input: 'a--x', expected: 'a--x', expectedCaret: 4 },
  // no-op
  { name: 'leaves dash-free text alone', input: 'hello', expected: 'hello', expectedCaret: 5 },
  { name: 'leaves a lone dash alone', input: 'a-b', expected: 'a-b', expectedCaret: 3 },
  // caret offset adjustment
  {
    name: 'adjusts the caret for each replacement before it',
    input: 'a--- b-- ',
    expected: 'a— b– ',
    expectedCaret: 6,
  },
  {
    name: 'leaves a caret before the replacement untouched',
    input: 'a---b',
    caret: 1,
    expected: 'a—b',
    expectedCaret: 1,
  },
  {
    name: 'adjusts a caret sitting exactly at the replacement end',
    input: 'a---b',
    caret: 4,
    expected: 'a—b',
    expectedCaret: 2,
  },
  // HR-shortcut exemption
  {
    name: "leaves a sole '---' paragraph alone when the HR shortcut is supported",
    input: '---',
    supportsHrShortcut: true,
    expected: '---',
    expectedCaret: 3,
  },
  {
    name: 'still replaces dashes in a longer paragraph when the HR shortcut is supported',
    input: 'a ---',
    supportsHrShortcut: true,
    expected: 'a —',
    expectedCaret: 3,
  },
]

describe('$replaceDashes', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor()
  })

  it.each(cases)('$name', async ({ input, caret, supportsHrShortcut, expected, expectedCaret }) => {
    const { text, caretOffset } = await runScan(editor, { input, caret, supportsHrShortcut })
    expect(text).toBe(expected)
    expect(caretOffset).toBe(expectedCaret)
  })

  it('replaces dashes without touching a non-collapsed selection', async () => {
    const result = await new Promise<{ text: string; anchor: number | null; focus: number | null }>((resolve) => {
      editor.update(() => {
        const paragraph = $createParagraphNode()
        const text = $createTextNode('a---b')
        paragraph.append(text)
        $getRoot().append(paragraph)
        text.select(0, 5)
        $replaceDashes(new Set([text.getKey()]), false)

        const selection = $getSelection()
        resolve({
          text: $getRoot().getTextContent(),
          anchor: $isRangeSelection(selection) ? selection.anchor.offset : null,
          focus: $isRangeSelection(selection) ? selection.focus.offset : null,
        })
      })
    })
    expect(result.text).toBe('a—b')
    expect(result.anchor).toBe(0)
    expect(result.focus).toBe(5)
  })

  it('replaces dashes when there is no selection at all', async () => {
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      const text = $createTextNode('---')
      paragraph.append(text)
      $getRoot().append(paragraph)
      $replaceDashes(new Set([text.getKey()]), false)
    })
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe('—')
  })

  it('ignores dirty leaves that are not text nodes', async () => {
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('---'))
      $getRoot().append(paragraph)
      if ($isParagraphNode(paragraph)) {
        $replaceDashes(new Set([paragraph.getKey()]), false)
      }
    })
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe('---')
  })
})
