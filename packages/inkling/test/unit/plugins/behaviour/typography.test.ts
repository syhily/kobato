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
import { $replaceTypography } from '@/plugins/behaviour/typography'

// Synchronous test table for the smart-typography grammar
// (@/plugins/behaviour/typography) — tiptap extension-typography
// default-rule parity (minus the em dash rule EmEnDashPlugin owns), the
// smart-quote direction policy, and caret offset adjustment, pinned by
// calling the scan body directly on a headless editor. The registration
// wiring (update-scan seam, 'history-push' tag, IME composition protection,
// undo) stays in test/unit/plugins/TypographyPlugin.test.tsx.

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
  expected: string
  expectedCaret: number
}

// Awaits the commit like the neighboring behaviour tests do — headless
// updates flush on a deferred callback, not synchronously.
async function runScan(
  editor: LexicalEditor,
  { input, caret = input.length }: Omit<ScanCase, 'name' | 'expected' | 'expectedCaret'>,
): Promise<{ text: string; caretOffset: number | null }> {
  await updateEditor(editor, () => {
    const paragraph = $createParagraphNode()
    const text = $createTextNode(input)
    paragraph.append(text)
    $getRoot().append(paragraph)
    text.select(caret, caret)
    $replaceTypography(new Set([text.getKey()]))
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
  // ellipsis
  { name: 'replaces three dots with an ellipsis', input: '...', expected: '…', expectedCaret: 1 },
  { name: 'replaces three dots mid-text', input: 'a...b', expected: 'a…b', expectedCaret: 3 },
  { name: 'replaces a four-dot run like per-keystroke typing does', input: '....', expected: '….', expectedCaret: 2 },
  { name: 'replaces a six-dot run with two ellipses', input: '......', expected: '……', expectedCaret: 2 },
  { name: 'leaves two dots alone', input: '..', expected: '..', expectedCaret: 2 },
  // smart double quotes — direction from the preceding character:
  // start-of-text or [\s{[(<'"‘“] opens, anything else closes
  { name: 'opens a double quote at text start', input: '"', expected: '“', expectedCaret: 1 },
  { name: 'closes a double quote after a word', input: 'a"', expected: 'a”', expectedCaret: 2 },
  { name: 'opens a double quote after whitespace', input: 'a "', expected: 'a “', expectedCaret: 3 },
  { name: 'opens a double quote after an opening paren', input: '("', expected: '(“', expectedCaret: 2 },
  { name: 'opens a double quote after another double quote', input: '""', expected: '““', expectedCaret: 2 },
  { name: 'wraps a word in directional double quotes', input: '"a"', expected: '“a”', expectedCaret: 3 },
  { name: 'closes a double quote after a curly open quote', input: '“a"', expected: '“a”', expectedCaret: 3 },
  // smart single quotes
  { name: 'opens a single quote at text start', input: "'", expected: '‘', expectedCaret: 1 },
  { name: 'curls an apostrophe inside a word', input: "don't", expected: 'don’t', expectedCaret: 5 },
  { name: 'wraps a word in directional single quotes', input: "'a'", expected: '‘a’', expectedCaret: 3 },
  // arrows
  { name: 'replaces a left arrow', input: '<-', expected: '←', expectedCaret: 1 },
  { name: 'replaces a right arrow', input: '->', expected: '→', expectedCaret: 1 },
  { name: 'replaces arrows mid-text', input: 'a <- b -> c', expected: 'a ← b → c', expectedCaret: 9 },
  // marks — lowercase only, tiptap parity
  { name: 'replaces the copyright mark', input: '(c)', expected: '©', expectedCaret: 1 },
  { name: 'replaces the trademark mark', input: '(tm)', expected: '™', expectedCaret: 1 },
  { name: 'replaces the servicemark mark', input: '(sm)', expected: '℠', expectedCaret: 1 },
  { name: 'replaces the registered trademark mark', input: '(r)', expected: '®', expectedCaret: 1 },
  { name: 'leaves an uppercase (C) alone', input: '(C)', expected: '(C)', expectedCaret: 3 },
  { name: 'replaces a mark mid-text', input: 'a (c) b', expected: 'a © b', expectedCaret: 5 },
  // fractions — start/whitespace boundary before, trailing whitespace after
  { name: 'replaces one half', input: '1/2 ', expected: '½ ', expectedCaret: 2 },
  { name: 'replaces one quarter', input: '1/4 ', expected: '¼ ', expectedCaret: 2 },
  { name: 'replaces three quarters', input: '3/4 ', expected: '¾ ', expectedCaret: 2 },
  { name: 'replaces a fraction after whitespace', input: 'a 1/2 ', expected: 'a ½ ', expectedCaret: 4 },
  { name: 'leaves a fraction without trailing whitespace alone', input: '1/2', expected: '1/2', expectedCaret: 3 },
  { name: 'leaves a fraction without a boundary before it alone', input: 'a1/2 ', expected: 'a1/2 ', expectedCaret: 5 },
  // plusMinus / notEqual
  { name: 'replaces plus minus', input: '+/-', expected: '±', expectedCaret: 1 },
  { name: 'replaces not equal', input: '!=', expected: '≠', expectedCaret: 1 },
  // guillemets
  { name: 'replaces a left guillemet', input: '<<', expected: '«', expectedCaret: 1 },
  { name: 'replaces a right guillemet', input: '>>', expected: '»', expectedCaret: 1 },
  // multiplication — only the '*'/'x' between digits
  { name: 'replaces x between digits with a multiplication sign', input: '2x3', expected: '2×3', expectedCaret: 3 },
  { name: 'replaces * between digits with a multiplication sign', input: '2*3', expected: '2×3', expectedCaret: 3 },
  { name: 'replaces a spaced multiplication', input: '2 x 3', expected: '2 × 3', expectedCaret: 5 },
  { name: 'replaces a multi-digit multiplication', input: '12x34', expected: '12×34', expectedCaret: 5 },
  {
    name: 'replaces chained multiplications like per-keystroke typing does',
    input: '2x3x4',
    expected: '2×3×4',
    expectedCaret: 5,
  },
  { name: 'leaves x between letters alone', input: 'axb', expected: 'axb', expectedCaret: 3 },
  // superscripts
  { name: 'replaces superscript two', input: '^2', expected: '²', expectedCaret: 1 },
  { name: 'replaces superscript three', input: '^3', expected: '³', expectedCaret: 1 },
  { name: 'leaves superscript four alone', input: '^4', expected: '^4', expectedCaret: 2 },
  // no-op
  { name: 'leaves plain text alone', input: 'hello', expected: 'hello', expectedCaret: 5 },
  { name: 'leaves already-curly quotes alone', input: '“a” ‘b’', expected: '“a” ‘b’', expectedCaret: 7 },
  // caret offset adjustment
  {
    name: 'leaves a caret before the replacement untouched',
    input: 'a...b',
    caret: 1,
    expected: 'a…b',
    expectedCaret: 1,
  },
  {
    name: 'adjusts a caret sitting exactly at the replacement end',
    input: 'a...b',
    caret: 4,
    expected: 'a…b',
    expectedCaret: 2,
  },
  {
    name: 'adjusts the caret for each replacement before it',
    input: '... (c) ...',
    expected: '… © …',
    expectedCaret: 5,
  },
  {
    name: 'does not move the caret for 1:1 quote replacements',
    input: '"a"',
    caret: 2,
    expected: '“a”',
    expectedCaret: 2,
  },
  // combined rules in one dirty leaf
  {
    name: 'applies quotes, ellipsis, and marks in one scan',
    input: 'a "b" ... (tm)',
    expected: 'a “b” … ™',
    expectedCaret: 9,
  },
]

describe('$replaceTypography', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor()
  })

  for (const scanCase of cases) {
    it(scanCase.name, async () => {
      const result = await runScan(editor, scanCase)
      expect(result.text).toBe(scanCase.expected)
      expect(result.caretOffset).toBe(scanCase.expectedCaret)
    })
  }

  it('leaves other dirty leaves untouched', async () => {
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      const untouched = $createTextNode('...')
      const scanned = $createTextNode('hello')
      paragraph.append(untouched, scanned)
      $getRoot().append(paragraph)
      $replaceTypography(new Set([scanned.getKey()]))
    })
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe('...hello')
    })
  })

  it('ignores dirty keys that are not text nodes', async () => {
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('...'))
      $getRoot().append(paragraph)
      expect($isParagraphNode(paragraph)).toBe(true)
      $replaceTypography(new Set([paragraph.getKey()]))
    })
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe('...')
    })
  })
})
