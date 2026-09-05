import { $isLinkNode, LinkNode } from '@lexical/link'
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  createEditor,
  type LexicalEditor,
} from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { updateEditor } from '#/utils/test-editor'
import { $isBookmarkNode, BookmarkNode } from '@/nodes/BookmarkNode'
import { ImageNode } from '@/nodes/ImageNode'
import { INSERT_CARD_COMMAND, PASTE_LINK_COMMAND } from '@/plugins/behaviour/commands'
import { registerLinkMatching } from '@/plugins/behaviour/registerLinkMatching'

function createTestEditor() {
  return createEditor({
    namespace: 'test',
    nodes: [ImageNode],
    onError: () => {},
  })
}

const PASTE_URL = 'https://example.com/article'
const pasteLinkPayload = { linkMatch: [PASTE_URL, PASTE_URL] as readonly [string, string] }

function placeCaretInBlankParagraph(editor: LexicalEditor): Promise<void> {
  return updateEditor(editor, () => {
    const paragraph = $createParagraphNode()
    $getRoot().clear().append(paragraph)
    paragraph.select()
  })
}

describe('registerLinkMatching', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor()
  })

  it('registers a paste-link command listener and returns a cleanup function', () => {
    const isShiftPressed = { current: false }
    const cleanup = registerLinkMatching(editor, { isShiftPressed })

    expect(typeof cleanup).toBe('function')
    cleanup()
  })
})

describe('registerLinkMatching bookmark card path', () => {
  it('dispatches INSERT_CARD_COMMAND with a bookmark when the card is registered', async () => {
    const editor = createEditor({ namespace: 'test', nodes: [LinkNode, BookmarkNode], onError: () => {} })
    const inserted: unknown[] = []
    editor.registerCommand(
      INSERT_CARD_COMMAND,
      ({ cardNode }) => {
        inserted.push(cardNode)
        return true
      },
      // outrank the link-matching listener so the capture sees the dispatch
      COMMAND_PRIORITY_HIGH,
    )
    registerLinkMatching(editor, { isShiftPressed: { current: false } })
    await placeCaretInBlankParagraph(editor)

    let handled = false
    await updateEditor(editor, () => {
      handled = editor.dispatchCommand(PASTE_LINK_COMMAND, pasteLinkPayload)
    })

    expect(handled).toBe(true)
    expect(inserted).toHaveLength(1)
    expect($isBookmarkNode(inserted[0])).toBe(true)
  })

  it('degrades to a plain link when the bookmark card is not registered', async () => {
    // plan C5: a card-free composition (the ./core entry) pastes a bare URL
    // into a blank paragraph as a link, not a bookmark card
    const editor = createEditor({ namespace: 'test', nodes: [LinkNode], onError: () => {} })
    registerLinkMatching(editor, { isShiftPressed: { current: false } })
    await placeCaretInBlankParagraph(editor)

    let handled = false
    await updateEditor(editor, () => {
      handled = editor.dispatchCommand(PASTE_LINK_COMMAND, pasteLinkPayload)
    })

    expect(handled).toBe(true)
    editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChild()
      const link = $isElementNode(paragraph) ? paragraph.getFirstChild() : null
      expect($isLinkNode(link)).toBe(true)
      expect($isLinkNode(link) && link.getURL()).toBe(PASTE_URL)
      expect(link?.getTextContent()).toBe(PASTE_URL)
      // the caret lands after the link (trailing-space workaround removes its node)
      const selection = $getSelection()
      expect($isRangeSelection(selection)).toBe(true)
    })
  })
})
