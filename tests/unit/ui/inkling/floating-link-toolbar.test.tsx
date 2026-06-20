/**
 * Floating link toolbar tests.
 *
 * The toolbar uses `mousemove` → `$getNearestNodeFromDOMNode` → `$isLinkNode`
 * for hover detection, and `TOGGLE_LINK_COMMAND` for link removal. We test
 * the Lexical-layer detection and action logic directly against a headless
 * editor.
 *
 * Note: headless editors do not automatically register the `LinkExtension`
 * handler for `TOGGLE_LINK_COMMAND`, so the full remove-link integration
 * path can only be verified in the React composer. Tests here focus on the
 * building blocks: detection, node access, and dispatch safety.
 */

// @vitest-environment happy-dom

import { createHeadlessEditor } from '@lexical/headless'
import { $isLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  ParagraphNode,
} from 'lexical'
import { describe, expect, it } from 'vitest'

function buildHeadlessEditor() {
  return createHeadlessEditor({
    namespace: 'floating-link-toolbar-test',
    onError: (err: Error) => console.error(err),
    nodes: [ParagraphNode, HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode],
  })
}

/** Insert a link node. Returns the editor and the link's key. */
function editorWithLink(
  url: string,
  text: string,
): {
  editor: ReturnType<typeof buildHeadlessEditor>
  linkKey: string
} {
  const editor = buildHeadlessEditor()
  let linkKey = ''

  editor.update(
    () => {
      const root = $getRoot()
      root.clear()
      const link = new LinkNode(url, { target: '_blank' })
      link.append($createTextNode(text))
      const para = $createParagraphNode()
      para.append(link)
      root.append(para)
      linkKey = link.getKey()
    },
    { discrete: true },
  )

  return { editor, linkKey }
}

// --- detection: $isLinkNode on a Lexical node --------------------------------

describe('FloatingLinkToolbar: link detection', () => {
  it('$isLinkNode returns true for a LinkNode', () => {
    const { editor } = editorWithLink('https://example.com', 'click here')
    let isLink = false
    editor.getEditorState().read(() => {
      const root = $getRoot()
      const para = root.getFirstChild()
      const link = para !== null && $isElementNode(para) ? para.getFirstChild() : null
      isLink = link !== null && $isLinkNode(link)
    })
    expect(isLink).toBe(true)
  })

  it('$isLinkNode returns true for the PARENT of a TextNode inside a link', () => {
    const { editor } = editorWithLink('https://example.com', 'click here')
    let isLinkParent = false
    editor.getEditorState().read(() => {
      const root = $getRoot()
      const para = root.getFirstChild()
      if (para !== null && $isElementNode(para)) {
        const link = para.getFirstChild()
        if (link !== null && $isElementNode(link)) {
          const textChild = link.getFirstChild()
          const parent = textChild?.getParent()
          isLinkParent = parent !== null && $isLinkNode(parent)
        }
      }
    })
    expect(isLinkParent).toBe(true)
  })

  it('$isLinkNode returns false for a plain ParagraphNode', () => {
    const editor = buildHeadlessEditor()
    editor.update(
      () => {
        const root = $getRoot()
        root.clear()
        const para = $createParagraphNode()
        para.append($createTextNode('plain text'))
        root.append(para)
      },
      { discrete: true },
    )
    let isLink = false
    editor.getEditorState().read(() => {
      const root = $getRoot()
      const para = root.getFirstChild()
      isLink = para !== null && $isLinkNode(para)
    })
    expect(isLink).toBe(false)
  })

  it('LinkNode.getURL() returns the href', () => {
    const { editor } = editorWithLink('https://example.com/page', 'click')
    let url = ''
    editor.getEditorState().read(() => {
      const root = $getRoot()
      const para = root.getFirstChild()
      if (para !== null && $isElementNode(para)) {
        const link = para.getFirstChild()
        if (link instanceof LinkNode) {
          url = link.getURL()
        }
      }
    })
    expect(url).toBe('https://example.com/page')
  })
})

// --- selection: LinkPopover.getExistingLink equivalent -----------------------

describe('FloatingLinkToolbar: selection for LinkPopover', () => {
  it('TextNode.select() creates a non-collapsed RangeSelection spanning the text', () => {
    // When a TextNode inside a LinkNode is fully selected, `getExistingLink`
    // can find the parent LinkNode and read its URL. This is the building
    // block for the toolbar's "edit" action — in the full React composer,
    // `ElementNode.select(0, childrenSize)` achieves the same selection.
    const { editor } = editorWithLink('https://e.com', 'keep this')
    editor.update(
      () => {
        const root = $getRoot()
        const para = root.getFirstChild()
        if (para !== null && $isElementNode(para)) {
          const link = para.getFirstChild()
          if (link !== null && $isLinkNode(link)) {
            const textChild = link.getFirstChild()
            if ($isTextNode(textChild)) {
              textChild.select(0, textChild.getTextContentSize())
            }
          }
        }
      },
      { discrete: true },
    )

    editor.getEditorState().read(() => {
      const sel = $getSelection()
      expect($isRangeSelection(sel)).toBe(true)
      if ($isRangeSelection(sel)) {
        expect(sel.isCollapsed()).toBe(false)
        expect(sel.getTextContent()).toBe('keep this')
      }
    })
  })

  it('getExistingLink-style read finds a LinkNode from a full-text selection', () => {
    const { editor } = editorWithLink('https://e.com', 'keep this')
    editor.update(
      () => {
        const root = $getRoot()
        const para = root.getFirstChild()
        if (para !== null && $isElementNode(para)) {
          const link = para.getFirstChild()
          if (link !== null && $isLinkNode(link)) {
            const textChild = link.getFirstChild()
            if ($isTextNode(textChild)) {
              textChild.select(0, textChild.getTextContentSize())
            }
          }
        }
      },
      { discrete: true },
    )

    // Replicate `LinkPopover.getExistingLink` logic.
    let result: { url: string; text: string } | null = null
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection) || selection.isCollapsed()) {
        return
      }
      for (const node of selection.getNodes()) {
        const parent = node.getParent()
        if ($isLinkNode(parent)) {
          result = { url: parent.getURL(), text: selection.getTextContent() }
          return
        }
      }
    })
    expect(result).not.toBeNull()
    expect(result!.url).toBe('https://e.com')
    expect(result!.text).toBe('keep this')
  })

  it('getExistingLink-style read returns null for collapsed selection', () => {
    const { editor } = editorWithLink('https://e.com', 'keep this')
    editor.update(() => {
      const root = $getRoot()
      const para = root.getFirstChild()
      if (para !== null && $isElementNode(para)) {
        const link = para.getFirstChild()
        if (link !== null && $isLinkNode(link)) {
          const textChild = link.getFirstChild()
          if ($isTextNode(textChild)) {
            textChild.select(1, 1) // collapsed caret
          }
        }
      }
    })

    let result: { url: string; text: string } | null = null
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection) || selection.isCollapsed()) {
        return
      }
      for (const node of selection.getNodes()) {
        const parent = node.getParent()
        if ($isLinkNode(parent)) {
          result = { url: parent.getURL(), text: selection.getTextContent() }
          return
        }
      }
    })
    expect(result).toBeNull()
  })
})

// --- actions ----------------------------------------------------------------

describe('FloatingLinkToolbar: remove action', () => {
  it('TOGGLE_LINK_COMMAND is dispatchable without throwing', () => {
    const { editor } = editorWithLink('https://e.com', 'keep this text')
    // The command is defined and dispatchable. Full link removal integration
    // (via LinkExtension handler) is verified in the React composer.
    expect(() => editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)).not.toThrow()
  })

  it('LinkNode exposes getChildrenSize() and getChildren() used by handleEdit', () => {
    const { editor } = editorWithLink('https://e.com', 'click here')
    editor.getEditorState().read(() => {
      const root = $getRoot()
      const para = root.getFirstChild()
      if (para !== null && $isElementNode(para)) {
        const link = para.getFirstChild()
        if (link instanceof LinkNode) {
          expect(link.getChildrenSize()).toBeGreaterThan(0)
          expect(link.getChildren().length).toBe(link.getChildrenSize())
        }
      }
    })
  })
})
