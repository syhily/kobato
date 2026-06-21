import { createHeadlessEditor } from '@lexical/headless'
import { LinkNode } from '@lexical/link'
import { $isListNode, ListItemNode, ListNode } from '@lexical/list'
import { $isHeadingNode, $isQuoteNode, HeadingNode, QuoteNode } from '@lexical/rich-text'
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  ParagraphNode,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical'
import { describe, expect, it } from 'vitest'

import { registerInklingMarkdownShortcuts } from '@/ui/inkling/editor/behaviour/markdown-shortcuts'

/**
 * Build a headless editor with the article prose node set + markdown
 * shortcuts registered. The markdown shortcut transforms fire on
 * ParagraphNode text changes, so we simulate typing by updating the
 * paragraph's text and committing with `discrete: true`.
 */
function buildEditor(): LexicalEditor {
  const editor = createHeadlessEditor({
    namespace: 'markdown-shortcuts-test',
    onError: (e) => {
      throw e
    },
    nodes: [ParagraphNode, HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode],
  })
  registerInklingMarkdownShortcuts(editor)
  return editor
}

/**
 * Simulate typing `text` into a fresh paragraph, one character at a time.
 *
 * The markdown shortcut transforms are character-driven: their update
 * listener requires the anchor offset to advance by exactly 1 per keystroke
 * (`anchorOffset > prevSelection.anchor.offset + 1` is rejected), and the
 * anchor text node must be in `dirtyLeaves`. `editor.insertText` goes
 * through the command pipeline and satisfies both — raw node mutation does
 * not. So we type character-by-character to faithfully reproduce real
 * input.
 */
function typeIntoParagraph(editor: LexicalEditor, text: string): void {
  // Seed an empty paragraph with the caret at the start — this establishes
  // the prevSelection the transform compares against on the first keystroke.
  editor.update(
    () => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      root.append(paragraph)
      paragraph.select(0, 0)
    },
    { discrete: true },
  )
  // Type each character in its own committed update. The markdown
  // transform's update listener requires (a) the anchor text node to be a
  // dirty leaf, and (b) the anchor offset to advance by exactly 1 from the
  // prev selection. `selection.insertText` mutates the text node and marks
  // it dirty; committing per-character gives the listener a distinct
  // prev→current selection pair to compare on each keystroke.
  //
  // The transform schedules its own nested `editor.update` from inside the
  // listener; in a DOM editor React flushes it, but a headless editor holds
  // it pending. A discrete no-op update after each character forces the
  // flush so the transform commits before the next keystroke.
  for (const char of text) {
    editor.update(
      () => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          selection.insertText(char)
        }
      },
      { discrete: true },
    )
    editor.update(
      () => {
        // no-op flush
      },
      { discrete: true },
    )
  }
}

/**
 * Assert the root's first child matches `predicate`, then run `assert`
 * INSIDE the editor read (node methods like `.getTag()` / `.getListType()`
 * call `getLatest()` which needs an active editor state — so they can't be
 * called on a node captured outside the read callback).
 */
function assertFirstChild<T extends LexicalNode>(
  editor: LexicalEditor,
  predicate: (n: LexicalNode | null | undefined) => n is T,
  assert: (node: T) => void,
): void {
  editor.getEditorState().read(() => {
    const first = $getRoot().getFirstChild()
    expect(predicate(first)).toBe(true)
    if (predicate(first)) {
      assert(first)
    }
  })
}

describe('inkling markdown shortcuts', () => {
  describe('block-level (line-start markers)', () => {
    it('converts "# " to an H1 heading', () => {
      const editor = buildEditor()
      typeIntoParagraph(editor, '# ')
      assertFirstChild(editor, $isHeadingNode, (heading) => {
        expect(heading.getTag()).toBe('h1')
      })
    })

    it('converts "## " to an H2 heading', () => {
      const editor = buildEditor()
      typeIntoParagraph(editor, '## ')
      assertFirstChild(editor, $isHeadingNode, (heading) => {
        expect(heading.getTag()).toBe('h2')
      })
    })

    it('converts "### " to an H3 heading', () => {
      const editor = buildEditor()
      typeIntoParagraph(editor, '### ')
      assertFirstChild(editor, $isHeadingNode, (heading) => {
        expect(heading.getTag()).toBe('h3')
      })
    })

    it('converts "> " to a blockquote', () => {
      const editor = buildEditor()
      typeIntoParagraph(editor, '> ')
      assertFirstChild(editor, $isQuoteNode, () => {
        // presence is enough — the predicate already asserted the type
      })
    })

    it('converts "* " to a bullet (unordered) list', () => {
      const editor = buildEditor()
      typeIntoParagraph(editor, '* ')
      assertFirstChild(editor, $isListNode, (list) => {
        expect(list.getListType()).toBe('bullet')
      })
    })

    it('converts "- " to a bullet (unordered) list', () => {
      const editor = buildEditor()
      typeIntoParagraph(editor, '- ')
      assertFirstChild(editor, $isListNode, (list) => {
        expect(list.getListType()).toBe('bullet')
      })
    })

    it('converts "1. " to a numbered (ordered) list', () => {
      const editor = buildEditor()
      typeIntoParagraph(editor, '1. ')
      assertFirstChild(editor, $isListNode, (list) => {
        expect(list.getListType()).toBe('number')
      })
    })
  })

  describe('inline (closing-marker triggers)', () => {
    it('wraps **text** as bold', () => {
      const editor = buildEditor()
      typeIntoParagraph(editor, '**bold**')
      editor.getEditorState().read(() => {
        const text = $getRoot().getFirstDescendant()
        expect($isTextNode(text)).toBe(true)
        if ($isTextNode(text)) {
          expect(text.hasFormat('bold')).toBe(true)
        }
      })
    })

    it('wraps *text* as italic', () => {
      const editor = buildEditor()
      typeIntoParagraph(editor, '*italic*')
      editor.getEditorState().read(() => {
        const text = $getRoot().getFirstDescendant()
        expect($isTextNode(text)).toBe(true)
        if ($isTextNode(text)) {
          expect(text.hasFormat('italic')).toBe(true)
        }
      })
    })

    it('wraps `code` as inline code', () => {
      const editor = buildEditor()
      typeIntoParagraph(editor, '`code`')
      editor.getEditorState().read(() => {
        const text = $getRoot().getFirstDescendant()
        expect($isTextNode(text)).toBe(true)
        if ($isTextNode(text)) {
          expect(text.hasFormat('code')).toBe(true)
        }
      })
    })

    it('wraps ~~text~~ as strikethrough', () => {
      const editor = buildEditor()
      typeIntoParagraph(editor, '~~strike~~')
      editor.getEditorState().read(() => {
        const text = $getRoot().getFirstDescendant()
        expect($isTextNode(text)).toBe(true)
        if ($isTextNode(text)) {
          expect(text.hasFormat('strikethrough')).toBe(true)
        }
      })
    })
  })

  describe('non-conversion', () => {
    it('does NOT convert plain text without markdown markers', () => {
      const editor = buildEditor()
      typeIntoParagraph(editor, 'just some text')
      editor.getEditorState().read(() => {
        const first = $getRoot().getFirstChild()
        // Stays a paragraph — no heading/quote/list.
        expect(first?.getType()).toBe('paragraph')
      })
    })

    it('does NOT convert "# " when it is not at the line start (prefixed by text)', () => {
      const editor = buildEditor()
      // "foo# " should stay a paragraph — the marker must be at the start.
      typeIntoParagraph(editor, 'foo# ')
      editor.getEditorState().read(() => {
        const first = $getRoot().getFirstChild()
        expect(first?.getType()).toBe('paragraph')
      })
    })
  })
})
