import { $createQuoteNode, $isQuoteNode, QuoteNode } from '@lexical/rich-text'
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isLineBreakNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  KEY_ENTER_COMMAND,
  type LexicalCommand,
  type LexicalEditor,
} from 'lexical'
import { describe, expect, it } from 'vitest'

import { createTestEditor, updateEditor } from '#/inkling/utils/test-editor'
import { registerQuoteEnterCommand } from '@/inkling/plugins/behaviour/keyboard-navigation/quote-enter'

// Enter-in-blockquote behaviour: a plain Enter opens a new paragraph inside
// the SAME quote (a double line break — block children are illegal inside
// element nodes here, see the denest transform), and only Enter on an empty
// quote paragraph leaves the blockquote.

function editorWithQuoteEnter(): LexicalEditor {
  const editor = createTestEditor({ nodes: [QuoteNode] })
  registerQuoteEnterCommand(editor)
  return editor
}

function dispatchEnter(editor: LexicalEditor, init: KeyboardEventInit = {}): Promise<boolean> {
  const command: LexicalCommand<KeyboardEvent> = KEY_ENTER_COMMAND
  return new Promise((resolve) => {
    let result = false
    editor.update(
      () => {
        result = editor.dispatchCommand(command, new KeyboardEvent('keydown', { key: 'Enter', ...init }))
      },
      { onUpdate: () => resolve(result) },
    )
  })
}

async function seedQuote(editor: LexicalEditor, text: string, caretOffset?: number): Promise<void> {
  await updateEditor(editor, () => {
    const quote = $createQuoteNode()
    if (text) {
      const textNode = $createTextNode(text)
      quote.append(textNode)
      $getRoot().append(quote)
      textNode.select(caretOffset ?? text.length, caretOffset ?? text.length)
    } else {
      $getRoot().append(quote)
      quote.select(0, 0)
    }
  })
}

function rootChildSummary() {
  return $getRoot()
    .getChildren()
    .map((child) => {
      if ($isQuoteNode(child)) {
        return `quote(${child
          .getChildren()
          .map((c) => ($isLineBreakNode(c) ? 'br' : $isTextNode(c) ? `text:${c.getTextContent()}` : c.getType()))
          .join('|')})`
      }
      return child.getType()
    })
}

describe('registerQuoteEnterCommand', () => {
  it('splits a new paragraph inside the same quote on a mid-text enter', async () => {
    const editor = editorWithQuoteEnter()
    await seedQuote(editor, 'hello world', 5)

    const handled = await dispatchEnter(editor)

    expect(handled).toBe(true)
    editor.read(() => {
      expect(rootChildSummary()).toEqual(['quote(text:hello|br|br|text: world)'])
      // the caret lands after the break pair, still inside the quote
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) {
        throw new Error('expected a range selection after the quote enter')
      }
      expect(selection.isCollapsed()).toBe(true)
      const anchorNode = selection.anchor.getNode()
      const insideQuote = $isQuoteNode(anchorNode) || anchorNode.getParents().some($isQuoteNode)
      expect(insideQuote).toBe(true)
    })
  })

  it('keeps the quote as the only top-level block on an end-of-text enter', async () => {
    const editor = editorWithQuoteEnter()
    await seedQuote(editor, 'hello')

    await dispatchEnter(editor)

    editor.read(() => {
      expect(rootChildSummary()).toEqual(['quote(text:hello|br|br)'])
    })
  })

  it('leaves the quote on the second consecutive enter', async () => {
    const editor = editorWithQuoteEnter()
    await seedQuote(editor, 'hello')

    await dispatchEnter(editor)
    const secondHandled = await dispatchEnter(editor)

    expect(secondHandled).toBe(true)
    editor.read(() => {
      expect(rootChildSummary()).toEqual(['quote(text:hello)', 'paragraph'])
      const selection = $getSelection()
      expect($isRangeSelection(selection) && $isParagraphNode(selection.anchor.getNode())).toBe(true)
    })
  })

  it('replaces an empty quote with a paragraph on the first enter', async () => {
    const editor = editorWithQuoteEnter()
    await seedQuote(editor, '')

    await dispatchEnter(editor)

    editor.read(() => {
      expect(rootChildSummary()).toEqual(['paragraph'])
    })
  })

  it('leaves a trailing empty quote paragraph cleanly even mid-quote content', async () => {
    const editor = editorWithQuoteEnter()
    // imported-shape quote: text, a paragraph break, more text — caret at end
    await updateEditor(editor, () => {
      const quote = $createQuoteNode()
      quote.append($createTextNode('first'), $createLineBreakNode(), $createLineBreakNode(), $createTextNode('second'))
      $getRoot().append(quote)
      const lastText = quote.getLastChild()
      if ($isTextNode(lastText)) {
        lastText.select(lastText.getTextContentSize(), lastText.getTextContentSize())
      }
    })

    await dispatchEnter(editor)
    await dispatchEnter(editor)

    editor.read(() => {
      expect(rootChildSummary()).toEqual(['quote(text:first|br|br|text:second)', 'paragraph'])
    })
  })

  it('passes enter through outside a quote', async () => {
    const editor = editorWithQuoteEnter()
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      const textNode = $createTextNode('plain')
      paragraph.append(textNode)
      $getRoot().append(paragraph)
      textNode.select(2, 2)
    })

    const handled = await dispatchEnter(editor)

    expect(handled).toBe(false)
    editor.read(() => {
      expect(rootChildSummary()).toEqual(['paragraph'])
    })
  })

  it('passes shift+enter through for the soft line break', async () => {
    const editor = editorWithQuoteEnter()
    await seedQuote(editor, 'hello')

    const handled = await dispatchEnter(editor, { shiftKey: true })

    expect(handled).toBe(false)
    editor.read(() => {
      expect(rootChildSummary()).toEqual(['quote(text:hello)'])
    })
  })

  it('passes a non-collapsed selection through to the default delete-and-split', async () => {
    const editor = editorWithQuoteEnter()
    await updateEditor(editor, () => {
      const quote = $createQuoteNode()
      const textNode = $createTextNode('hello')
      quote.append(textNode)
      $getRoot().append(quote)
      textNode.select(1, 4)
    })

    const handled = await dispatchEnter(editor)

    expect(handled).toBe(false)
    editor.read(() => {
      expect(rootChildSummary()).toEqual(['quote(text:hello)'])
    })
  })
})
