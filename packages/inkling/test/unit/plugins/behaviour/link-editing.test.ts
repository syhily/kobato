import { $createLinkNode, $isLinkNode, $toggleLink, LinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $nodesOfType,
  COMMAND_PRIORITY_NORMAL,
  createEditor,
  KEY_DOWN_COMMAND,
  type LexicalCommand,
  type LexicalEditor,
} from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { updateEditor } from '#/utils/test-editor'
import {
  $createAtLinkNode,
  $createAtLinkSearchNode,
  $createZWNJNode,
  $isAtLinkSearchNode,
  AtLinkNode,
  AtLinkSearchNode,
  ZWNJNode,
} from '@/nodes/base'
import {
  $applyLinkToSelection,
  $getLinkHrefAtSelection,
  $removeLink,
  $selectLinkText,
  createLinkHoverFeed,
  createToolbarRevealFeed,
  createToolbarSession,
  isLinkShortcutPress,
  registerToolbarCommands,
  registerToolbarSelectionSync,
  type HoveredLink,
  type ToolbarSession,
} from '@/plugins/behaviour/link-editing'

function createTestEditor(): LexicalEditor {
  const editor = createEditor({ namespace: 'test', nodes: [LinkNode], onError: () => {} })
  // the production TOGGLE_LINK_COMMAND handler lives in LinkPlugin; the
  // headless editor registers the same $toggleLink behaviour directly
  editor.registerCommand(
    TOGGLE_LINK_COMMAND,
    (payload) => {
      $toggleLink(typeof payload === 'string' ? payload : null)
      return true
    },
    COMMAND_PRIORITY_NORMAL,
  )
  return editor
}

// updateEditor (the shared harness) awaits the commit of a non-discrete
// update so the following read sees the new state.
function selectText(editor: LexicalEditor, text: string): Promise<void> {
  return updateEditor(editor, () => {
    const root = $getRoot()
    root.clear()
    const paragraph = $createParagraphNode()
    const textNode = $createTextNode(text)
    paragraph.append(textNode)
    root.append(paragraph)
    textNode.select(0, text.length)
  })
}

function linkSelection(editor: LexicalEditor, url: string): Promise<void> {
  return updateEditor(editor, () => {
    $applyLinkToSelection(editor, url)
  })
}

function dispatchAndCommit<T>(editor: LexicalEditor, command: LexicalCommand<T>, payload: T): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false
    editor.update(
      () => {
        result = editor.dispatchCommand(command, payload)
      },
      { onUpdate: () => resolve(result) },
    )
  })
}

describe('$applyLinkToSelection', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor()
  })

  it('links the selected text and collapses the selection to the end of the focus node', async () => {
    await selectText(editor, 'hello')
    await linkSelection(editor, 'https://example.com')

    editor.getEditorState().read(() => {
      const links = $nodesOfType(LinkNode)
      expect(links).toHaveLength(1)
      expect(links[0].getURL()).toBe('https://example.com')
      expect(links[0].getTextContent()).toBe('hello')

      const selection = $getSelection()
      expect($isRangeSelection(selection)).toBe(true)
      if ($isRangeSelection(selection)) {
        expect(selection.isCollapsed()).toBe(true)
        expect(selection.anchor.offset).toBe(5)
      }
    })
  })

  it('removes the link when the url is empty', async () => {
    await selectText(editor, 'hello')
    await linkSelection(editor, 'https://example.com')

    // re-select the linked text and apply an empty url
    await updateEditor(editor, () => {
      const link = $nodesOfType(LinkNode)[0]
      const text = link.getFirstChild()
      if (!$isTextNode(text)) {
        throw new Error('expected link text')
      }
      text.select(0, 5)
      $applyLinkToSelection(editor, '')
    })

    editor.getEditorState().read(() => {
      expect($nodesOfType(LinkNode)).toHaveLength(0)
    })
  })
})

describe('$getLinkHrefAtSelection', () => {
  let editor: LexicalEditor

  beforeEach(async () => {
    editor = createTestEditor()
    await selectText(editor, 'hello')
    await linkSelection(editor, 'https://example.com')
  })

  it('returns the href when the selection is on a link', () => {
    editor.getEditorState().read(() => {
      expect($getLinkHrefAtSelection()).toBe('https://example.com')
    })
  })

  it('returns an empty string when the selection is not on a link', async () => {
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('plain'))
      $getRoot().append(paragraph)
      paragraph.select(1, 1)
    })

    editor.getEditorState().read(() => {
      expect($getLinkHrefAtSelection()).toBe('')
    })
  })
})

describe('$selectLinkText', () => {
  it('selects the link text from end to end', async () => {
    const editor = createTestEditor()
    await selectText(editor, 'hello')
    await linkSelection(editor, 'https://example.com')

    await updateEditor(editor, () => {
      const link = $nodesOfType(LinkNode)[0]
      expect($selectLinkText(link)).toBe(true)
    })

    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isRangeSelection(selection)).toBe(true)
      if ($isRangeSelection(selection)) {
        expect(selection.isCollapsed()).toBe(false)
        expect(selection.anchor.offset).toBe(0)
        expect(selection.focus.offset).toBe(5)
        expect(selection.getTextContent()).toBe('hello')
      }
    })
  })
})

describe('createToolbarSession', () => {
  it('starts hidden and shows the text toolbar for a text selection', () => {
    const session = createToolbarSession()
    expect(session.handle.getState()).toEqual({ type: 'hidden', href: '', hoveredLink: null })

    session.syncSelection({ textSelected: true, href: '' })
    expect(session.handle.getState()).toEqual({ type: 'text', href: '', hoveredLink: null })
  })

  it('notifies subscribers on transitions', () => {
    const session = createToolbarSession()
    const listener = vi.fn()
    session.handle.subscribe(listener)

    session.syncSelection({ textSelected: true, href: 'https://example.com' })
    expect(listener).toHaveBeenCalledWith({ type: 'text', href: 'https://example.com', hoveredLink: null })
  })

  it('hides the text toolbar when the selection is lost or collapses, keeping the href', () => {
    const session = createToolbarSession()
    session.syncSelection({ textSelected: true, href: 'https://example.com' })

    session.syncSelection({ textSelected: false, href: 'https://example.com' })
    expect(session.handle.getState()).toEqual({ type: 'hidden', href: 'https://example.com', hoveredLink: null })

    session.syncSelection({ textSelected: true, href: '' })
    session.syncSelection(null)
    expect(session.handle.getState().type).toBe('hidden')
  })

  it('ignores selection sync while a link toolbar is open', () => {
    const session = createToolbarSession()
    session.syncSelection({ textSelected: true, href: '' })
    session.openLink()

    session.syncSelection(null)
    session.syncSelection({ textSelected: false, href: 'https://example.com' })
    expect(session.handle.getState().type).toBe('link')
    expect(session.handle.getState().href).toBe('')
  })

  it('ignores selection sync while a snippet toolbar is open', () => {
    const session = createToolbarSession()
    session.openSnippet()
    session.syncSelection({ textSelected: true, href: '' })
    expect(session.handle.getState().type).toBe('snippet')
  })

  it('opens the link toolbar with an explicit href (edit-link) and closes back to hidden', () => {
    const session = createToolbarSession()
    session.openLink('https://example.com')
    expect(session.handle.getState()).toEqual({ type: 'link', href: 'https://example.com', hoveredLink: null })

    session.close()
    expect(session.handle.getState()).toEqual({ type: 'hidden', href: 'https://example.com', hoveredLink: null })
  })

  it('opens the link toolbar without touching the synced href (cmd-K)', () => {
    const session = createToolbarSession()
    session.syncSelection({ textSelected: true, href: 'https://example.com' })
    session.openLink()
    expect(session.handle.getState()).toEqual({ type: 'link', href: 'https://example.com', hoveredLink: null })
  })
})

describe('$removeLink', () => {
  it('removes the link and keeps its text selected', async () => {
    const editor = createTestEditor()
    await selectText(editor, 'hello')
    await linkSelection(editor, 'https://example.com')

    await updateEditor(editor, () => {
      $removeLink(editor, $nodesOfType(LinkNode)[0])
    })

    editor.getEditorState().read(() => {
      expect($nodesOfType(LinkNode)).toHaveLength(0)
      expect($getRoot().getTextContent()).toBe('hello')
      // linkNode.select() collapses the caret to the end of the link's last
      // text child (ElementNode.select with no offsets), so the removal
      // leaves a collapsed caret at the end of the kept text
      const selection = $getSelection()
      expect($isRangeSelection(selection)).toBe(true)
      if ($isRangeSelection(selection)) {
        expect(selection.isCollapsed()).toBe(true)
        expect(selection.anchor.offset).toBe(5)
      }
    })
  })
})

describe('createToolbarSession hovered link', () => {
  function createHoveredLink(href = 'https://example.com'): HoveredLink {
    // the session only ever compares linkNode identity, so a stub suffices
    return { linkNode: {} as LinkNode, href, targetElem: document.createElement('a') }
  }

  it('feeds the hovered link while hidden and clears it when the text toolbar opens', () => {
    const session = createToolbarSession()
    const hovered = createHoveredLink()

    session.syncHover(hovered)
    expect(session.handle.getState().hoveredLink).toBe(hovered)

    session.syncSelection({ textSelected: true, href: '' })
    expect(session.handle.getState()).toEqual({ type: 'text', href: '', hoveredLink: null })
  })

  it('ignores hover feeds while any toolbar is open', () => {
    const session = createToolbarSession()

    session.syncSelection({ textSelected: true, href: '' })
    session.syncHover(createHoveredLink())
    expect(session.handle.getState().hoveredLink).toBeNull()

    session.close()
    session.openLink()
    session.syncHover(createHoveredLink())
    expect(session.handle.getState().hoveredLink).toBeNull()

    session.close()
    session.openSnippet()
    session.syncHover(createHoveredLink())
    expect(session.handle.getState().hoveredLink).toBeNull()
  })

  it('clears the hovered link when a link or snippet toolbar opens explicitly', () => {
    const session = createToolbarSession()

    session.syncHover(createHoveredLink())
    session.openLink()
    expect(session.handle.getState().hoveredLink).toBeNull()

    session.close()
    session.syncHover(createHoveredLink())
    session.openSnippet()
    expect(session.handle.getState().hoveredLink).toBeNull()
  })

  it('keeps the hovered link across selection syncs that stay hidden', () => {
    const session = createToolbarSession()
    const hovered = createHoveredLink()
    session.syncHover(hovered)

    session.syncSelection({ textSelected: false, href: '' })
    expect(session.handle.getState().hoveredLink).toBe(hovered)

    session.syncSelection(null)
    expect(session.handle.getState().hoveredLink).toBe(hovered)
  })

  it('clears the hovered link through syncHover(null) — the remove-link path', () => {
    const session = createToolbarSession()
    session.syncHover(createHoveredLink())

    session.syncHover(null)
    expect(session.handle.getState().hoveredLink).toBeNull()
  })

  it('clears the hovered link on close — the outside-click close must unmount the hover toolbar', () => {
    const session = createToolbarSession()
    session.syncHover(createHoveredLink())
    expect(session.handle.getState().hoveredLink).not.toBeNull()

    session.close()
    expect(session.handle.getState()).toEqual({ type: 'hidden', href: '', hoveredLink: null })
  })

  it('swallows re-feeds of the same link over the same element', () => {
    const session = createToolbarSession()
    const hovered = createHoveredLink()
    const listener = vi.fn()
    session.handle.subscribe(listener)

    session.syncHover(hovered)
    expect(listener).toHaveBeenCalledTimes(1)

    session.syncHover({ ...hovered })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(session.handle.getState().hoveredLink).toBe(hovered)
  })
})

/** An editor with a reconciled root element, so $getNearestNodeFromDOMNode / getElementByKey work in jsdom. */
function createDomLinkedEditor(): { editor: LexicalEditor; rootElement: HTMLDivElement } {
  const editor = createTestEditor()
  const rootElement = document.createElement('div')
  document.body.appendChild(rootElement)
  editor.setRootElement(rootElement)
  return { editor, rootElement }
}

function appendLinkAndPlainText(editor: LexicalEditor): Promise<void> {
  return updateEditor(editor, () => {
    const root = $getRoot()
    root.clear()
    const linkParagraph = $createParagraphNode()
    const link = $createLinkNode('https://example.com')
    link.append($createTextNode('hello'))
    linkParagraph.append(link)
    const plainParagraph = $createParagraphNode()
    plainParagraph.append($createTextNode('plain'))
    root.append(linkParagraph, plainParagraph)
  })
}

describe('createLinkHoverFeed', () => {
  let editor: LexicalEditor
  let rootElement: HTMLDivElement

  beforeEach(async () => {
    const domEditor = createDomLinkedEditor()
    editor = domEditor.editor
    rootElement = domEditor.rootElement
    await appendLinkAndPlainText(editor)
    return () => {
      rootElement.remove()
    }
  })

  function getLinkElements() {
    const anchor = rootElement.querySelector('a')
    const linkText = anchor?.querySelector('span')
    const plainText = rootElement.querySelector('p:last-child span')
    if (!anchor || !linkText || !plainText) {
      throw new Error('expected the reconciled link and plain text elements')
    }
    return { anchor, linkText, plainText }
  }

  it('resolves the link under the mouse into the session', () => {
    const session = createToolbarSession()
    const feed = createLinkHoverFeed(editor, session, { getToolbarElement: () => null })
    const { anchor } = getLinkElements()

    feed.hover(anchor)

    const { hoveredLink } = session.handle.getState()
    expect($isLinkNode(hoveredLink?.linkNode)).toBe(true)
    expect(hoveredLink?.href).toBe('https://example.com')
    expect(hoveredLink?.targetElem).toBe(anchor)
  })

  it('resolves the parent link when hovering the link text element', () => {
    const session = createToolbarSession()
    const feed = createLinkHoverFeed(editor, session, { getToolbarElement: () => null })
    const { linkText } = getLinkElements()

    feed.hover(linkText)

    const { hoveredLink } = session.handle.getState()
    expect($isLinkNode(hoveredLink?.linkNode)).toBe(true)
    expect(hoveredLink?.targetElem).toBe(linkText)
  })

  it('clears the hovered link when the mouse moves off links', () => {
    const session = createToolbarSession()
    const feed = createLinkHoverFeed(editor, session, { getToolbarElement: () => null })
    const { anchor, plainText } = getLinkElements()

    feed.hover(anchor)
    expect(session.handle.getState().hoveredLink).not.toBeNull()

    feed.hover(plainText)
    expect(session.handle.getState().hoveredLink).toBeNull()
  })

  it('keeps the hovered link while the mouse is over the hover toolbar itself', () => {
    const toolbarElement = document.createElement('div')
    const toolbarButton = document.createElement('button')
    toolbarElement.appendChild(toolbarButton)
    const session = createToolbarSession()
    const feed = createLinkHoverFeed(editor, session, { getToolbarElement: () => toolbarElement })
    const { anchor } = getLinkElements()

    feed.hover(anchor)
    feed.hover(toolbarButton)

    expect(session.handle.getState().hoveredLink?.targetElem).toBe(anchor)
  })

  it('ignores hover targets that are not elements', () => {
    const session = createToolbarSession()
    const feed = createLinkHoverFeed(editor, session, { getToolbarElement: () => null })

    feed.hover(document)

    expect(session.handle.getState().hoveredLink).toBeNull()
  })

  it('is suppressed while another toolbar is open', () => {
    const session = createToolbarSession()
    const feed = createLinkHoverFeed(editor, session, { getToolbarElement: () => null })
    const { anchor } = getLinkElements()

    session.syncSelection({ textSelected: true, href: '' })
    feed.hover(anchor)

    expect(session.handle.getState().hoveredLink).toBeNull()
  })
})

describe('createToolbarRevealFeed', () => {
  it('ignores mouse travel within the move threshold', async () => {
    const editor = createTestEditor()
    await selectText(editor, 'hello')
    const reveal = vi.fn()
    const feed = createToolbarRevealFeed(editor, { reveal })

    feed.move({ x: 0, y: 0 }, 0)
    feed.move({ x: 3, y: 3 }, 0)

    expect(reveal).not.toHaveBeenCalled()
  })

  it('reveals once the threshold is crossed with a range selection, then restarts the threshold', async () => {
    const editor = createTestEditor()
    await selectText(editor, 'hello')
    const reveal = vi.fn()
    const feed = createToolbarRevealFeed(editor, { reveal })

    feed.move({ x: 0, y: 0 }, 0)
    feed.move({ x: 10, y: 0 }, 0)
    expect(reveal).toHaveBeenCalledTimes(1)

    // the threshold restarted: small travel from the new position does not reveal
    feed.move({ x: 12, y: 0 }, 0)
    feed.move({ x: 14, y: 0 }, 0)
    expect(reveal).toHaveBeenCalledTimes(1)

    feed.move({ x: 20, y: 0 }, 0)
    expect(reveal).toHaveBeenCalledTimes(2)
  })

  it('ignores mousemoves while a mouse button is held', async () => {
    const editor = createTestEditor()
    await selectText(editor, 'hello')
    const reveal = vi.fn()
    const feed = createToolbarRevealFeed(editor, { reveal })

    feed.move({ x: 0, y: 0 }, 0)
    feed.move({ x: 10, y: 0 }, 1)
    expect(reveal).not.toHaveBeenCalled()

    // the drag did not consume the initial position either
    feed.move({ x: 11, y: 0 }, 0)
    expect(reveal).toHaveBeenCalledTimes(1)
  })

  it('does not reveal on threshold crossing without a selection', () => {
    const editor = createTestEditor()
    const reveal = vi.fn()
    const feed = createToolbarRevealFeed(editor, { reveal })

    feed.move({ x: 0, y: 0 }, 0)
    feed.move({ x: 10, y: 0 }, 0)

    expect(reveal).not.toHaveBeenCalled()
  })

  it('reveals on threshold crossing with a collapsed caret — the check is only $isRangeSelection', async () => {
    const editor = createTestEditor()
    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('hello'))
      root.append(paragraph)
      paragraph.select(1, 1)
    })
    const reveal = vi.fn()
    const feed = createToolbarRevealFeed(editor, { reveal })

    feed.move({ x: 0, y: 0 }, 0)
    feed.move({ x: 10, y: 0 }, 0)

    expect(reveal).toHaveBeenCalledTimes(1)
  })

  it('does not reveal on release without a range selection', () => {
    const editor = createTestEditor()
    const reveal = vi.fn()
    const feed = createToolbarRevealFeed(editor, { reveal })

    feed.release(document.body)

    expect(reveal).not.toHaveBeenCalled()
  })

  describe('with a reconciled selection', () => {
    let editor: LexicalEditor
    let rootElement: HTMLDivElement

    beforeEach(async () => {
      const domEditor = createDomLinkedEditor()
      editor = domEditor.editor
      rootElement = domEditor.rootElement
      await selectText(editor, 'hello')
      return () => {
        rootElement.remove()
      }
    })

    function getSelectedTextElement(): HTMLElement {
      const element = rootElement.querySelector('span')
      if (!element) {
        throw new Error('expected the reconciled text element')
      }
      return element
    }

    it('reveals when the mouse releases inside the selection', () => {
      const reveal = vi.fn()
      const feed = createToolbarRevealFeed(editor, { reveal })

      feed.release(getSelectedTextElement())

      expect(reveal).toHaveBeenCalledTimes(1)
    })

    it('reveals when the mouse releases on an ancestor of the selection', () => {
      const reveal = vi.fn()
      const feed = createToolbarRevealFeed(editor, { reveal })

      feed.release(rootElement)

      expect(reveal).toHaveBeenCalledTimes(1)
    })

    it('does not reveal when the mouse releases outside the selection', () => {
      const reveal = vi.fn()
      const feed = createToolbarRevealFeed(editor, { reveal })
      const outside = document.createElement('div')
      document.body.appendChild(outside)
      try {
        feed.release(outside)

        expect(reveal).not.toHaveBeenCalled()
      } finally {
        outside.remove()
      }
    })
  })
})

/** An editor with the at-link family registered and a reconciled root element, for the selection classifier. */
function createClassifierEditor(): { editor: LexicalEditor; rootElement: HTMLDivElement } {
  const editor = createEditor({
    namespace: 'test',
    nodes: [LinkNode, AtLinkNode, AtLinkSearchNode, ZWNJNode],
    onError: () => {},
  })
  const rootElement = document.createElement('div')
  document.body.appendChild(rootElement)
  editor.setRootElement(rootElement)
  return { editor, rootElement }
}

// Places the native selection and dispatches the document selectionchange the
// classifier listens to — mimics the browser driving the listener.
function dispatchNativeSelection(anchorNode: Node, anchorOffset: number, focusNode: Node, focusOffset: number) {
  const nativeSelection = window.getSelection()
  if (!nativeSelection) {
    throw new Error('expected a native selection')
  }
  nativeSelection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset)
  document.dispatchEvent(new Event('selectionchange'))
}

describe('registerToolbarSelectionSync', () => {
  let editor: LexicalEditor
  let rootElement: HTMLDivElement
  let session: ToolbarSession

  beforeEach(() => {
    const domEditor = createClassifierEditor()
    editor = domEditor.editor
    rootElement = domEditor.rootElement
    session = createToolbarSession()
    const unregister = registerToolbarSelectionSync(editor, session)
    return () => {
      unregister()
      rootElement.remove()
    }
  })

  // The rendered DOM text of the editor's only plain-text node — the native
  // selection anchor for an in-editor selection.
  function getPlainTextDom(): Node {
    const spans = rootElement.querySelectorAll('span')
    const text = spans[spans.length - 1]?.firstChild
    if (!text) {
      throw new Error('expected the reconciled text element')
    }
    return text
  }

  it('opens the text toolbar for a selected range of text', async () => {
    await selectText(editor, 'hello')

    const text = getPlainTextDom()
    dispatchNativeSelection(text, 0, text, 5)

    expect(session.handle.getState()).toEqual({ type: 'text', href: '', hoveredLink: null })
  })

  it('hides the text toolbar when the selection collapses to a caret', async () => {
    await selectText(editor, 'hello')
    const text = getPlainTextDom()
    dispatchNativeSelection(text, 0, text, 5)
    expect(session.handle.getState().type).toBe('text')

    await updateEditor(editor, () => {
      const paragraph = $getRoot().getFirstChild()
      if (!$isElementNode(paragraph)) {
        throw new Error('expected the paragraph')
      }
      const textNode = paragraph.getFirstChild()
      if (!$isTextNode(textNode)) {
        throw new Error('expected the paragraph text')
      }
      textNode.select(0, 0)
    })
    dispatchNativeSelection(text, 0, text, 0)

    // a collapsed caret carries no text: textSelected is false and the
    // session hides, keeping the href
    expect(session.handle.getState()).toEqual({ type: 'hidden', href: '', hoveredLink: null })
  })

  it('suppresses the toolbar while the selection is inside an at-link search node', async () => {
    let searchNodeKey = ''
    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      const atLinkNode = $createAtLinkNode()
      atLinkNode.append($createZWNJNode())
      const searchNode = $createAtLinkSearchNode('abc')
      atLinkNode.append(searchNode)
      paragraph.append(atLinkNode, $createTextNode('plain'))
      root.append(paragraph)
      searchNodeKey = searchNode.getKey()
    })

    // liveness: a plain-text selection opens the toolbar through the same listener
    await updateEditor(editor, () => {
      const paragraph = $getRoot().getFirstChild()
      if (!$isElementNode(paragraph)) {
        throw new Error('expected the paragraph')
      }
      const textNode = paragraph.getLastChild()
      if (!$isTextNode(textNode)) {
        throw new Error('expected the plain text')
      }
      textNode.select(0, 5)
    })
    const plainText = getPlainTextDom()
    dispatchNativeSelection(plainText, 0, plainText, 5)
    expect(session.handle.getState().type).toBe('text')

    // the same selected-text shape inside the at-link search node is suppressed
    await updateEditor(editor, () => {
      const paragraph = $getRoot().getFirstChild()
      if (!$isElementNode(paragraph)) {
        throw new Error('expected the paragraph')
      }
      const atLinkNode = paragraph.getFirstChild()
      if (!$isElementNode(atLinkNode)) {
        throw new Error('expected the at-link node')
      }
      const searchNode = atLinkNode.getChildAtIndex(1)
      if (!$isAtLinkSearchNode(searchNode)) {
        throw new Error('expected the at-link search node')
      }
      searchNode.select(0, 3)
    })
    const searchElement = editor.getElementByKey(searchNodeKey)
    const searchText = searchElement?.firstChild
    if (!searchText) {
      throw new Error('expected the reconciled search node element')
    }
    dispatchNativeSelection(searchText, 0, searchText, 3)

    expect(session.handle.getState().type).toBe('hidden')
  })

  it('closes the toolbar when the native selection moves outside the editor', async () => {
    await selectText(editor, 'hello')
    const text = getPlainTextDom()
    dispatchNativeSelection(text, 0, text, 5)
    expect(session.handle.getState().type).toBe('text')

    const outside = document.createElement('div')
    outside.textContent = 'outside'
    document.body.appendChild(outside)
    try {
      const outsideText = outside.firstChild
      if (!outsideText) {
        throw new Error('expected the outside text')
      }
      dispatchNativeSelection(outsideText, 0, outsideText, 7)

      expect(session.handle.getState().type).toBe('hidden')
    } finally {
      outside.remove()
    }
  })

  it('ignores selection changes while composing', async () => {
    await selectText(editor, 'hello')
    const text = getPlainTextDom()

    // editor.isComposing() is not reachable through jsdom composition events —
    // spy the bail condition directly (same approach as the at-link tests)
    const composing = vi.spyOn(editor, 'isComposing').mockReturnValue(true)
    dispatchNativeSelection(text, 0, text, 5)
    expect(session.handle.getState().type).toBe('hidden')

    composing.mockRestore()
    dispatchNativeSelection(text, 0, text, 5)
    expect(session.handle.getState().type).toBe('text')
  })
})

describe('isLinkShortcutPress', () => {
  const press = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)

  it('matches ctrl/cmd+K without shift', () => {
    expect(isLinkShortcutPress(press({ code: 'KeyK', ctrlKey: true }))).toBe(true)
    expect(isLinkShortcutPress(press({ code: 'KeyK', metaKey: true }))).toBe(true)
  })

  it('rejects shift, other keys, and no modifier', () => {
    expect(isLinkShortcutPress(press({ code: 'KeyK', ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(isLinkShortcutPress(press({ code: 'KeyJ', ctrlKey: true }))).toBe(false)
    expect(isLinkShortcutPress(press({ code: 'KeyK' }))).toBe(false)
  })
})

describe('registerToolbarCommands', () => {
  it('opens the link toolbar and swallows ctrl/cmd+K on a range selection', async () => {
    const editor = createTestEditor()
    await selectText(editor, 'hello')
    const session = createToolbarSession()
    const cleanup = registerToolbarCommands(editor, session)

    const result = await dispatchAndCommit(
      editor,
      KEY_DOWN_COMMAND,
      new KeyboardEvent('keydown', { code: 'KeyK', ctrlKey: true }),
    )

    expect(result).toBe(true)
    expect(session.handle.getState().type).toBe('link')
    cleanup()
  })

  it('does not open the link toolbar on a collapsed selection or shift+K', async () => {
    const editor = createTestEditor()
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('hello'))
      $getRoot().append(paragraph)
      paragraph.selectStart()
    })
    const session = createToolbarSession()
    const cleanup = registerToolbarCommands(editor, session)

    // the command chain's boolean is shared with Lexical's built-in
    // handlers — the session is the reliable verdict
    await dispatchAndCommit(editor, KEY_DOWN_COMMAND, new KeyboardEvent('keydown', { code: 'KeyK', ctrlKey: true }))
    await dispatchAndCommit(
      editor,
      KEY_DOWN_COMMAND,
      new KeyboardEvent('keydown', { code: 'KeyK', ctrlKey: true, shiftKey: true }),
    )

    expect(session.handle.getState().type).toBe('hidden')
    cleanup()
  })
})
