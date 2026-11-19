import { $unwrapSpecialMarkupFormat } from '@kobato/inkling-internal/plugins/behaviour/markdown-unwrap'
import { updateEditor } from '@kobato/inkling/tests/utils/test-editor'
import { createHeadlessEditor } from '@lexical/headless'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
  type TextFormatType,
} from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

function createTestEditor(): LexicalEditor {
  return createHeadlessEditor({
    namespace: 'test',
    nodes: [],
    onError: (error) => {
      throw error
    },
  })
}

interface UnwrapCase {
  name: string
  input: string
  format: TextFormatType

  caret?: number
  expected: string
  expectedCaret: number

  expectedFormat?: number
}

async function runUnwrap(
  editor: LexicalEditor,
  { input, format, caret = input.length }: Omit<UnwrapCase, 'name' | 'expected' | 'expectedCaret'>,
): Promise<{ text: string; caretOffset: number | null; formatBitmask: number }> {
  let unwrapped = false
  await updateEditor(editor, () => {
    const paragraph = $createParagraphNode()
    const text = $createTextNode(input)
    text.setFormat(format)
    paragraph.append(text)
    $getRoot().append(paragraph)
    text.select(caret, caret)
    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      unwrapped = $unwrapSpecialMarkupFormat(text, selection)
    }
  })
  if (!unwrapped) {
    throw new Error('expected the unwrap to fire')
  }
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    const text = $getRoot().getAllTextNodes()[0]
    return {
      text: $getRoot().getTextContent(),
      caretOffset: $isRangeSelection(selection) ? selection.anchor.offset : null,
      formatBitmask: text?.getFormat() ?? -1,
    }
  })
}

const cases: UnwrapCase[] = [
  { name: 'unwraps code', input: 'code', format: 'code', expected: '`code', expectedCaret: 5 },
  {
    name: 'unwraps superscript',
    input: 'superscript',
    format: 'superscript',
    expected: '^superscript',
    expectedCaret: 12,
  },
  { name: 'unwraps subscript', input: 'subscript', format: 'subscript', expected: '~subscript', expectedCaret: 10 },
  {
    name: 'unwraps strikethrough',
    input: 'strikethrough',
    format: 'strikethrough',
    expected: '~~strikethrough~',
    expectedCaret: 16,
  },

  {
    name: 'pushes a mid-text caret by the markup delta',
    input: 'code',
    format: 'code',
    caret: 2,
    expected: '`code',
    expectedCaret: 3,
  },
  {
    name: 'strips the last character of a replacement string without re-adding markup',
    input: '{{variable}}',
    format: 'code',
    expected: '{{variable}',
    expectedCaret: 11,
  },

  {
    name: 're-adds markup when the brace is not a replacement string',
    input: 'a{b} ',
    format: 'code',
    expected: '`a{b} ',
    expectedCaret: 6,
  },
]

describe('$unwrapSpecialMarkupFormat', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor()
  })

  cases.forEach((testCase) => {
    it(testCase.name, async () => {
      const result = await runUnwrap(editor, testCase)

      expect(result.text).toBe(testCase.expected)
      expect(result.caretOffset).toBe(testCase.expectedCaret)
      expect(result.formatBitmask).toBe(testCase.expectedFormat ?? 0)
    })
  })

  it('returns false and leaves the node alone when it carries no special format', async () => {
    let unwrapped: boolean | null = null
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      const text = $createTextNode('plain')
      text.setFormat('bold')
      paragraph.append(text)
      $getRoot().append(paragraph)
      text.select(5, 5)
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        unwrapped = $unwrapSpecialMarkupFormat(text, selection)
      }
    })

    expect(unwrapped).toBe(false)
    editor.getEditorState().read(() => {
      const text = $getRoot().getAllTextNodes()[0]
      expect($getRoot().getTextContent()).toBe('plain')
      expect(text?.hasFormat('bold')).toBe(true)
    })
  })
})
