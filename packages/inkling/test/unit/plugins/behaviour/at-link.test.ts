import { LinkNode } from '@lexical/link'
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $nodesOfType,
  $setSelection,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  DELETE_CHARACTER_COMMAND,
  FORMAT_TEXT_COMMAND,
  KEY_ESCAPE_COMMAND,
  createEditor,
  type LexicalEditor,
  type TextNode,
} from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { drainEnqueuedUpdates, tick } from '#/utils/test-editor'
import {
  $createAtLinkNode,
  $createAtLinkSearchNode,
  $createZWNJNode,
  AtLinkNode,
  AtLinkSearchNode,
  ZWNJNode,
} from '@/nodes/base'
import { BookmarkNode } from '@/nodes/BookmarkNode'
// Characterization pins for the at-link behaviour, driven headlessly through
// the registrations in src/plugins/behaviour/at-link.ts (insertion, session,
// guards, shape transform, commit surgery). The mounted-plugin gating and
// popup wiring live in test/unit/plugins/AtLinkPlugin.test.tsx.
//
// Harness notes:
// - The root element is attached before registering so the native 'input'
//   fallback listener attaches (it only attaches when a root element exists
//   at registration time).
// - The editor is set non-editable: in jsdom the DOM-selection round-trip
//   normalizes a caret at the start of the (empty) search node onto the
//   preceding ZWNJ text node, while the session's update listener normalizes
//   it back — the two fight forever until Lexical's cascade guard trips.
//   Editability only gates Lexical's DOM-selection writes; the editor-state
//   transitions pinned here are identical either way.
// - Paste-into-search-node is not unit-pinned: jsdom has no ClipboardEvent
//   implementation, so the guard's `instanceof ClipboardEvent` branch cannot
//   be reached. Coverage stays with e2e (test/e2e/linking.test.ts "can paste
//   into at-link node").
import {
  $commitAtLinkSelection,
  registerAtLinkGuards,
  registerAtLinkInsertion,
  registerAtLinkNodeTransform,
  registerAtLinkSession,
  type AtLinkCommitResult,
  type AtLinkSessionSnapshot,
} from '@/plugins/behaviour/at-link'

// jsdom's Selection lacks the (non-standard) modify() API, which
// RangeSelection.deleteCharacter routes through on the native fallback's
// delete-the-'@' step. Polyfill the collapsed-text character cases the
// fallback relies on; other shapes are left as no-ops.
if (!Selection.prototype.modify) {
  const adjacentTextNode = (node: Node, direction: 'previous' | 'next'): Text | null => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const textNodes: Text[] = []
    let current = walker.nextNode()
    while (current) {
      if (current.textContent !== '') {
        textNodes.push(current as Text)
      }
      current = walker.nextNode()
    }
    const index = textNodes.indexOf(node as Text)
    if (index === -1) {
      return null
    }
    return textNodes[direction === 'previous' ? index - 1 : index + 1] ?? null
  }
  Selection.prototype.modify = function (alter?: string, direction?: string, granularity?: string) {
    if (this.rangeCount === 0 || granularity !== 'character') {
      return
    }
    const range = this.getRangeAt(0)
    let node: Node = range.startContainer
    let offset = range.startOffset
    if (!range.collapsed || node.nodeType !== Node.TEXT_NODE) {
      return
    }
    const text = node.textContent ?? ''
    if (direction === 'backward') {
      if (offset === 0) {
        const prev = adjacentTextNode(node, 'previous')
        if (!prev) {
          return
        }
        node = prev
        offset = prev.length
      }
      this.setBaseAndExtent(node, offset, node, offset - 1)
    } else {
      if (offset === text.length) {
        const next = adjacentTextNode(node, 'next')
        if (!next) {
          return
        }
        node = next
        offset = 0
      }
      this.setBaseAndExtent(node, offset, node, offset + 1)
    }
  }
}

function createTestEditor() {
  return createEditor({
    namespace: 'test',
    nodes: [AtLinkNode, AtLinkSearchNode, ZWNJNode, LinkNode, BookmarkNode],
    theme: { atLink: 'at-link', atLinkIcon: 'at-link-icon', atLinkSearch: 'at-link-search' },
    onError: () => {},
  })
}

// Lexical 0.46 commits updates on a microtask, and listener-triggered
// cascade updates defer again — the drain/tick pair from the test-editor
// harness drains the whole queue so assertions see the settled state (the
// previous renderHook harness got the same drain for free from act()).
async function dispatchCommand(editor: LexicalEditor, ...args: Parameters<LexicalEditor['dispatchCommand']>) {
  const result = editor.dispatchCommand(...args)
  await tick()
  return result
}

// --- editor-state JSON builders -------------------------------------------

const textNodeJSON = (text: string, format = 0) => ({
  detail: 0,
  format,
  mode: 'normal',
  style: '',
  text,
  type: 'text',
  version: 1,
})

const zwnjNodeJSON = () => ({
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text: '',
  type: 'zwnj',
  version: 1,
})

const searchNodeJSON = (text: string) => ({
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text,
  type: 'at-link-search',
  version: 1,
  placeholder: null,
})

const atLinkNodeJSON = (linkFormat: number | null, searchText = '') => ({
  children: [zwnjNodeJSON(), searchNodeJSON(searchText)],
  direction: null,
  format: '',
  indent: 0,
  linkFormat,
  type: 'at-link',
  version: 1,
})

// an element node with a text child does not serialize textFormat/textStyle
// (lexical #7968), unlike the paragraph wrapper around it
const linkNodeJSON = (text: string, url: string, format = 0) => ({
  children: [textNodeJSON(text, format)],
  direction: null,
  format: '',
  indent: 0,
  rel: null,
  target: null,
  title: null,
  type: 'link',
  url,
  version: 1,
})

const paragraphJSON = (children: unknown[], textFormat = 0) => ({
  children,
  direction: null,
  format: '',
  indent: 0,
  textFormat,
  textStyle: '',
  type: 'paragraph',
  version: 1,
})

const editorStateJSON = (...paragraphs: unknown[]) => ({
  root: {
    children: paragraphs,
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
})

// --- state builders --------------------------------------------------------

interface TextSegment {
  text: string
  format?: number
}

// Builds a single paragraph from text segments with a collapsed caret at
// [segment, offset], or an element-point caret when caret is 'element'.
async function buildSingleParagraph(
  editor: LexicalEditor,
  segments: TextSegment[],
  caret: { segment: number; anchorOffset: number; focusOffset?: number } | 'element',
) {
  await drainEnqueuedUpdates(editor, () => {
    const root = $getRoot()
    root.clear()
    const paragraph = $createParagraphNode()
    const textNodes = segments.map(({ text, format }) => {
      const node = $createTextNode(text)
      if (format !== undefined) {
        node.setFormat(format)
      }
      return node
    })
    paragraph.append(...textNodes)
    root.append(paragraph)
    if (caret === 'element') {
      paragraph.select(0, 0)
    } else {
      textNodes[caret.segment].select(caret.anchorOffset, caret.focusOffset ?? caret.anchorOffset)
    }
  })
}

// Builds 'hello ' + at-link(searchText) + ' world' in one paragraph with a
// collapsed caret inside the search node, so the session focuses the at-link.
async function buildAtLinkParagraph(editor: LexicalEditor, searchText = 'abc') {
  await drainEnqueuedUpdates(editor, () => {
    const root = $getRoot()
    root.clear()
    const paragraph = $createParagraphNode()
    const before = $createTextNode('hello ')
    const atLinkNode = $createAtLinkNode()
    atLinkNode.append($createZWNJNode())
    const searchNode = $createAtLinkSearchNode(searchText)
    atLinkNode.append(searchNode)
    const after = $createTextNode(' world')
    paragraph.append(before, atLinkNode, after)
    root.append(paragraph)
    searchNode.select(1, 1)
  })
}

function readCollapsedPoint(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
      return null
    }
    const node = selection.anchor.getNode()
    return { nodeType: node.getType(), offset: selection.anchor.offset, text: node.getTextContent() }
  })
}

function readRangePoints(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) {
      return null
    }
    return {
      anchor: { nodeType: selection.anchor.getNode().getType(), offset: selection.anchor.offset },
      focus: { nodeType: selection.focus.getNode().getType(), offset: selection.focus.offset },
    }
  })
}

describe('at-link behaviour (headless registrations)', () => {
  let editor: LexicalEditor
  let rootElement: HTMLDivElement
  let sessionSnapshots: AtLinkSessionSnapshot[]

  const lastSession = () => sessionSnapshots[sessionSnapshots.length - 1]

  async function dispatchNativeAt() {
    // Mirror the Lexical caret into the DOM selection first — in a real
    // browser the DOM caret is already there when the input event fires,
    // and the fallback's deleteCharacter step extends it via
    // Selection.modify (polyfilled above).
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection) && selection.isCollapsed() && selection.anchor.type === 'text') {
        const element = editor.getElementByKey(selection.anchor.key)
        const textDOM = element?.firstChild
        if (textDOM) {
          window.getSelection()?.setBaseAndExtent(textDOM, selection.anchor.offset, textDOM, selection.anchor.offset)
        }
      }
    })
    rootElement.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: '@' }))
    // Clear the DOM selection before the commit microtask runs so later
    // update cycles don't read a stale DOM selection back (see harness
    // notes above).
    window.getSelection()?.removeAllRanges()
    await tick()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    sessionSnapshots = []
    editor = createTestEditor()
    rootElement = document.createElement('div')
    document.body.appendChild(rootElement)
    editor.setRootElement(rootElement)
    editor.setEditable(false)
    // same registration order as the React adapter's effects
    registerAtLinkInsertion(editor)
    registerAtLinkSession(editor, { onSessionChange: (snapshot) => sessionSnapshots.push(snapshot) })
    registerAtLinkGuards(editor)
    registerAtLinkNodeTransform(editor)
    return () => {
      rootElement.remove()
    }
  })

  describe('controlled insertion path', () => {
    it('(a) converts an empty paragraph (element anchor)', async () => {
      await buildSingleParagraph(editor, [], 'element')

      expect(await dispatchCommand(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '@')).toBe(true)

      expect(editor.getEditorState().toJSON()).toEqual(editorStateJSON(paragraphJSON([atLinkNodeJSON(0)])))
      expect(readCollapsedPoint(editor)).toEqual({ nodeType: 'at-link-search', offset: 0, text: '' })
    })

    it("(b) converts after 'hello ' with the caret at the end", async () => {
      await buildSingleParagraph(editor, [{ text: 'hello ' }], { segment: 0, anchorOffset: 6 })

      expect(await dispatchCommand(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '@')).toBe(true)

      expect(editor.getEditorState().toJSON()).toEqual(
        editorStateJSON(paragraphJSON([textNodeJSON('hello '), atLinkNodeJSON(0)])),
      )
      expect(readCollapsedPoint(editor)).toEqual({ nodeType: 'at-link-search', offset: 0, text: '' })
    })

    it("(c) does not convert after 'hello' (no whitespace before the caret)", async () => {
      await buildSingleParagraph(editor, [{ text: 'hello' }], { segment: 0, anchorOffset: 5 })
      const before = editor.getEditorState().toJSON()

      expect(await dispatchCommand(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '@')).toBe(false)

      expect(editor.getEditorState().toJSON()).toEqual(before)
    })

    it("(d) converts with the caret immediately before a '.' text sibling", async () => {
      await buildSingleParagraph(editor, [{ text: 'hello ' }, { text: '.world' }], { segment: 0, anchorOffset: 6 })

      expect(await dispatchCommand(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '@')).toBe(true)

      expect(editor.getEditorState().toJSON()).toEqual(
        editorStateJSON(paragraphJSON([textNodeJSON('hello '), atLinkNodeJSON(0), textNodeJSON('.world')])),
      )
      expect(readCollapsedPoint(editor)).toEqual({ nodeType: 'at-link-search', offset: 0, text: '' })
    })

    it('(e) converts at offset 0 of a text node whose previous sibling ends in whitespace', async () => {
      await buildSingleParagraph(editor, [{ text: 'hello ' }, { text: ' world' }], { segment: 1, anchorOffset: 0 })

      expect(await dispatchCommand(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '@')).toBe(true)

      expect(editor.getEditorState().toJSON()).toEqual(
        editorStateJSON(paragraphJSON([textNodeJSON('hello '), atLinkNodeJSON(0), textNodeJSON(' world')])),
      )
      expect(readCollapsedPoint(editor)).toEqual({ nodeType: 'at-link-search', offset: 0, text: '' })
    })

    it('(f) carries the bold format of the anchor text into the at-link', async () => {
      await buildSingleParagraph(editor, [{ text: 'hello ', format: 1 }], { segment: 0, anchorOffset: 6 })

      expect(await dispatchCommand(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '@')).toBe(true)

      expect(editor.getEditorState().toJSON()).toEqual(
        editorStateJSON(paragraphJSON([textNodeJSON('hello ', 1), atLinkNodeJSON(1)], 1)),
      )
    })

    it('(g) is a no-op for a non-collapsed selection', async () => {
      await buildSingleParagraph(editor, [{ text: 'hello world' }], { segment: 0, anchorOffset: 0, focusOffset: 5 })
      const before = editor.getEditorState().toJSON()

      expect(await dispatchCommand(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '@')).toBe(false)

      expect(editor.getEditorState().toJSON()).toEqual(before)
    })
  })

  describe('native input fallback path', () => {
    it('(a) converts a "@" typed into an empty paragraph, matching the controlled path', async () => {
      // what the browser produces after typing '@' into an empty paragraph
      await buildSingleParagraph(editor, [{ text: '@' }], { segment: 0, anchorOffset: 1 })

      await dispatchNativeAt()

      expect(editor.getEditorState().toJSON()).toEqual(editorStateJSON(paragraphJSON([atLinkNodeJSON(0)])))
      expect(readCollapsedPoint(editor)).toEqual({ nodeType: 'at-link-search', offset: 0, text: '' })
    })

    it('(b) converts a trailing "@" after whitespace, matching the controlled path', async () => {
      await buildSingleParagraph(editor, [{ text: 'hello @' }], { segment: 0, anchorOffset: 7 })

      await dispatchNativeAt()

      expect(editor.getEditorState().toJSON()).toEqual(
        editorStateJSON(paragraphJSON([textNodeJSON('hello '), atLinkNodeJSON(0)])),
      )
      expect(readCollapsedPoint(editor)).toEqual({ nodeType: 'at-link-search', offset: 0, text: '' })
    })

    it('(c) does not convert a trailing "@" without preceding whitespace', async () => {
      await buildSingleParagraph(editor, [{ text: 'hello@' }], { segment: 0, anchorOffset: 6 })
      const before = editor.getEditorState().toJSON()

      await dispatchNativeAt()

      expect(editor.getEditorState().toJSON()).toEqual(before)
    })

    it('(d) converts a trailing "@" before a "." sibling, matching the controlled path', async () => {
      await buildSingleParagraph(editor, [{ text: 'hello @' }, { text: '.world' }], { segment: 0, anchorOffset: 7 })

      await dispatchNativeAt()

      expect(editor.getEditorState().toJSON()).toEqual(
        editorStateJSON(paragraphJSON([textNodeJSON('hello '), atLinkNodeJSON(0), textNodeJSON('.world')])),
      )
      expect(readCollapsedPoint(editor)).toEqual({ nodeType: 'at-link-search', offset: 0, text: '' })
    })

    it('(e) converts a trailing "@" carried by the previous sibling, matching the controlled path', async () => {
      await buildSingleParagraph(editor, [{ text: 'hello @' }, { text: ' world' }], { segment: 1, anchorOffset: 0 })

      await dispatchNativeAt()

      expect(editor.getEditorState().toJSON()).toEqual(
        editorStateJSON(paragraphJSON([textNodeJSON('hello '), atLinkNodeJSON(0), textNodeJSON(' world')])),
      )
      expect(readCollapsedPoint(editor)).toEqual({ nodeType: 'at-link-search', offset: 0, text: '' })
    })
  })

  describe('removal and guards', () => {
    async function convertAndSetQuery(query: string, format?: number) {
      if (format === undefined) {
        await buildSingleParagraph(editor, [], 'element')
      } else {
        await buildSingleParagraph(editor, [{ text: 'hello ', format }], { segment: 0, anchorOffset: 6 })
      }
      expect(await dispatchCommand(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '@')).toBe(true)
      await drainEnqueuedUpdates(editor, () => {
        const atLinkNode = $nodesOfType(AtLinkNode)[0]
        const searchNode = atLinkNode.getChildAtIndex(1)
        if (searchNode instanceof AtLinkSearchNode) {
          searchNode.setTextContent(query)
          searchNode.select(0, 0)
        }
      })
    }

    it('escape reverts to "@" + query text carrying the original format, caret at its end', async () => {
      await convertAndSetQuery('abc', 1)

      expect(await dispatchCommand(editor, KEY_ESCAPE_COMMAND, new KeyboardEvent('keydown'))).toBe(true)

      // the reverted text merges with the preceding bold text node (same format)
      expect(editor.getEditorState().toJSON()).toEqual(
        editorStateJSON(paragraphJSON([textNodeJSON('hello @abc', 1)], 1)),
      )
      expect(readCollapsedPoint(editor)).toEqual({ nodeType: 'text', offset: 10, text: 'hello @abc' })
    })

    it('backspace at search-node offset 0 reverts to "@"', async () => {
      await convertAndSetQuery('')

      expect(await dispatchCommand(editor, DELETE_CHARACTER_COMMAND, true)).toBe(true)

      expect(editor.getEditorState().toJSON()).toEqual(editorStateJSON(paragraphJSON([textNodeJSON('@')])))
      expect(readCollapsedPoint(editor)).toEqual({ nodeType: 'text', offset: 1, text: '@' })
    })

    it('swallows FORMAT_TEXT_COMMAND while the search node is focused', async () => {
      await convertAndSetQuery('abc')
      const before = editor.getEditorState().toJSON()

      expect(await dispatchCommand(editor, FORMAT_TEXT_COMMAND, 'bold')).toBe(true)

      expect(editor.getEditorState().toJSON()).toEqual(before)
    })
  })

  describe('at-link shape transform', () => {
    it('inserts a missing ZWNJ first child', async () => {
      await drainEnqueuedUpdates(editor, () => {
        const root = $getRoot()
        root.clear()
        const paragraph = $createParagraphNode()
        const atLinkNode = $createAtLinkNode()
        atLinkNode.append($createAtLinkSearchNode('abc'))
        paragraph.append(atLinkNode)
        root.append(paragraph)
        atLinkNode.select(1, 1)
      })

      expect(editor.getEditorState().toJSON()).toEqual(editorStateJSON(paragraphJSON([atLinkNodeJSON(null, 'abc')])))
    })

    it('replaces a non-search child carrying text with a search node and consolidates', async () => {
      await drainEnqueuedUpdates(editor, () => {
        const root = $getRoot()
        root.clear()
        const paragraph = $createParagraphNode()
        const atLinkNode = $createAtLinkNode()
        atLinkNode.append($createZWNJNode())
        atLinkNode.append($createAtLinkSearchNode(''))
        atLinkNode.append($createTextNode('hello'))
        paragraph.append(atLinkNode)
        root.append(paragraph)
        atLinkNode.select(1, 1)
      })

      expect(editor.getEditorState().toJSON()).toEqual(editorStateJSON(paragraphJSON([atLinkNodeJSON(null, 'hello')])))
    })

    it('consolidates multiple search nodes into one with concatenated text', async () => {
      await drainEnqueuedUpdates(editor, () => {
        const root = $getRoot()
        root.clear()
        const paragraph = $createParagraphNode()
        const atLinkNode = $createAtLinkNode()
        atLinkNode.append($createZWNJNode())
        atLinkNode.append($createAtLinkSearchNode('foo'))
        atLinkNode.append($createAtLinkSearchNode('bar'))
        paragraph.append(atLinkNode)
        root.append(paragraph)
        atLinkNode.select(1, 1)
      })

      expect(editor.getEditorState().toJSON()).toEqual(editorStateJSON(paragraphJSON([atLinkNodeJSON(null, 'foobar')])))
    })
  })

  describe('search session', () => {
    it('emits the focused node and query as snapshots when the query text changes', async () => {
      await buildSingleParagraph(editor, [], 'element')
      expect(await dispatchCommand(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '@')).toBe(true)

      const focusedKey = editor.getEditorState().read(() => $nodesOfType(AtLinkNode)[0].getKey())
      expect(lastSession()?.focusedNode?.getKey()).toBe(focusedKey)
      expect(lastSession()?.query).toBe('')

      await drainEnqueuedUpdates(editor, () => {
        const searchNode = $nodesOfType(AtLinkNode)[0].getChildAtIndex(1)
        if (searchNode instanceof AtLinkSearchNode) {
          searchNode.setTextContent('abc')
          searchNode.selectEnd()
        }
      })

      expect(lastSession()?.focusedNode?.getKey()).toBe(focusedKey)
      expect(lastSession()?.query).toBe('abc')
    })

    it('removes the at-link when the selection moves outside it', async () => {
      await drainEnqueuedUpdates(editor, () => {
        const root = $getRoot()
        root.clear()
        const first = $createParagraphNode()
        first.append($createTextNode('hello'))
        const second = $createParagraphNode()
        root.append(first, second)
        second.select(0, 0)
      })
      expect(await dispatchCommand(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '@')).toBe(true)

      await drainEnqueuedUpdates(editor, () => {
        const first = $getRoot().getFirstChild()
        if ($isElementNode(first)) {
          const text = first.getFirstChild()
          if ($isTextNode(text)) {
            text.select(0, 0)
          }
        }
      })

      expect(editor.getEditorState().toJSON()).toEqual(
        editorStateJSON(paragraphJSON([textNodeJSON('hello')]), paragraphJSON([textNodeJSON('@')])),
      )
      expect(readCollapsedPoint(editor)).toEqual({ nodeType: 'text', offset: 0, text: 'hello' })
      expect(lastSession()).toEqual({ focusedNode: null, query: '' })
    })

    it('removes unfocused at-link nodes, keeping only the focused one', async () => {
      await drainEnqueuedUpdates(editor, () => {
        const root = $getRoot()
        root.clear()
        const first = $createParagraphNode()
        const firstAtLink = $createAtLinkNode()
        firstAtLink.append($createZWNJNode())
        const firstSearch = $createAtLinkSearchNode('foo')
        firstAtLink.append(firstSearch)
        first.append(firstAtLink)
        const second = $createParagraphNode()
        const secondAtLink = $createAtLinkNode()
        secondAtLink.append($createZWNJNode())
        secondAtLink.append($createAtLinkSearchNode('bar'))
        second.append(secondAtLink)
        root.append(first, second)
        firstSearch.select(0, 0)
      })

      expect(editor.getEditorState().toJSON()).toEqual(
        editorStateJSON(paragraphJSON([atLinkNodeJSON(null, 'foo')]), paragraphJSON([textNodeJSON('@bar')])),
      )
      expect(lastSession()?.query).toBe('foo')
    })

    it('removes all at-link nodes when the selection is not a range selection', async () => {
      await buildSingleParagraph(editor, [], 'element')
      expect(await dispatchCommand(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '@')).toBe(true)
      await drainEnqueuedUpdates(editor, () => {
        const searchNode = $nodesOfType(AtLinkNode)[0].getChildAtIndex(1)
        if (searchNode instanceof AtLinkSearchNode) {
          searchNode.setTextContent('abc')
          searchNode.selectEnd()
        }
      })

      await drainEnqueuedUpdates(editor, () => {
        $setSelection(null)
      })

      expect(editor.getEditorState().toJSON()).toEqual(editorStateJSON(paragraphJSON([textNodeJSON('@abc')])))
      expect(lastSession()).toEqual({ focusedNode: null, query: '' })
    })

    it('skips the tree scan while composing, resuming once composition ends', async () => {
      await buildSingleParagraph(editor, [{ text: 'hello ' }], { segment: 0, anchorOffset: 6 })
      expect(await dispatchCommand(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '@')).toBe(true)

      // editor.isComposing() is not reachable through jsdom composition
      // events — spy the bail condition directly
      const composing = vi.spyOn(editor, 'isComposing').mockReturnValue(true)
      await drainEnqueuedUpdates(editor, () => {
        const first = $getRoot().getFirstChild()
        if ($isElementNode(first)) {
          const text = first.getFirstChild()
          if ($isTextNode(text)) {
            text.select(0, 0)
          }
        }
      })

      // the selection moved out, but the at-link survives the composing bail
      expect(editor.getEditorState().toJSON()).toEqual(
        editorStateJSON(paragraphJSON([textNodeJSON('hello '), atLinkNodeJSON(0)])),
      )

      composing.mockRestore()
      await drainEnqueuedUpdates(editor, () => {
        const first = $getRoot().getFirstChild()
        if ($isElementNode(first)) {
          const text = first.getFirstChild()
          if ($isTextNode(text)) {
            text.setTextContent('hello!')
          }
        }
      })

      // the reverted '@' merges with the preceding same-format text node
      expect(editor.getEditorState().toJSON()).toEqual(editorStateJSON(paragraphJSON([textNodeJSON('hello!@')])))
      expect(lastSession()).toEqual({ focusedNode: null, query: '' })
    })

    it('normalizes a ZWNJ-anchored selection back into the search node', async () => {
      await buildSingleParagraph(editor, [], 'element')
      expect(await dispatchCommand(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '@')).toBe(true)

      // The listener gates on the DOM selection's anchorOffset being 0; place
      // it outside the editor so jsdom's selection round-trip cannot fight
      // the normalization (see harness notes above).
      window.getSelection()?.setBaseAndExtent(document.body, 0, document.body, 0)

      await drainEnqueuedUpdates(editor, () => {
        const atLinkNode = $nodesOfType(AtLinkNode)[0]
        const zwnjNode = atLinkNode.getFirstChild()
        if (zwnjNode instanceof ZWNJNode) {
          zwnjNode.select(0, 0)
        }
      })

      expect(readCollapsedPoint(editor)).toEqual({ nodeType: 'at-link-search', offset: 0, text: '' })
      expect(editor.getEditorState().toJSON()).toEqual(editorStateJSON(paragraphJSON([atLinkNodeJSON(0)])))
    })

    it('removes the at-link when the search is empty and the caret sits on the ZWNJ', async () => {
      await buildSingleParagraph(editor, [], 'element')
      expect(await dispatchCommand(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '@')).toBe(true)

      // keep the DOM selection's anchorOffset away from 0 so the ZWNJ
      // normalization cannot move the caret into the search node first —
      // this isolates the listener's empty-search removal branch
      window.getSelection()?.setBaseAndExtent(document.body, 1, document.body, 1)

      await drainEnqueuedUpdates(editor, () => {
        const zwnjNode = $nodesOfType(AtLinkNode)[0].getFirstChild()
        if (zwnjNode instanceof ZWNJNode) {
          zwnjNode.select(0, 0)
        }
      })

      expect(editor.getEditorState().toJSON()).toEqual(editorStateJSON(paragraphJSON([textNodeJSON('@')])))
      expect(readCollapsedPoint(editor)).toEqual({ nodeType: 'text', offset: 1, text: '@' })
      expect(lastSession()).toEqual({ focusedNode: null, query: '' })
    })
  })

  describe('range selection spanning an at-link node', () => {
    // Places a range selection with endpoints in the 'hello ' text (before),
    // the search node (search), or the ' world' text (after).
    async function setRange(
      anchor: { segment: 'before' | 'search' | 'after'; offset: number },
      focus: { segment: 'before' | 'search' | 'after'; offset: number },
    ) {
      await drainEnqueuedUpdates(editor, () => {
        const atLinkNode = $nodesOfType(AtLinkNode)[0]
        const searchNode = atLinkNode.getChildAtIndex(1)
        const before = atLinkNode.getPreviousSibling()
        const after = atLinkNode.getNextSibling()
        const nodeFor = (segment: 'before' | 'search' | 'after'): TextNode => {
          const node = segment === 'search' ? searchNode : segment === 'before' ? before : after
          if (!$isTextNode(node)) {
            throw new Error(`expected a text node for segment ${segment}`)
          }
          return node
        }
        const selection = $createRangeSelection()
        selection.setTextNodeRange(nodeFor(anchor.segment), anchor.offset, nodeFor(focus.segment), focus.offset)
        $setSelection(selection)
      })
    }

    it('clamps a range extending after the at-link back to the search node end', async () => {
      await buildAtLinkParagraph(editor)

      await setRange({ segment: 'search', offset: 1 }, { segment: 'after', offset: 2 })

      expect(readRangePoints(editor)).toEqual({
        anchor: { nodeType: 'at-link-search', offset: 1 },
        focus: { nodeType: 'at-link-search', offset: 3 },
      })
      expect(editor.getEditorState().toJSON()).toEqual(
        editorStateJSON(paragraphJSON([textNodeJSON('hello '), atLinkNodeJSON(null, 'abc'), textNodeJSON(' world')])),
      )
      expect(lastSession()?.query).toBe('abc')
    })

    it('clamps a range extending before the at-link back to the search node start', async () => {
      await buildAtLinkParagraph(editor)

      await setRange({ segment: 'search', offset: 2 }, { segment: 'before', offset: 2 })

      expect(readRangePoints(editor)).toEqual({
        anchor: { nodeType: 'at-link-search', offset: 2 },
        focus: { nodeType: 'at-link-search', offset: 0 },
      })
      expect(editor.getEditorState().toJSON()).toEqual(
        editorStateJSON(paragraphJSON([textNodeJSON('hello '), atLinkNodeJSON(null, 'abc'), textNodeJSON(' world')])),
      )
    })

    it('leaves a range wholly inside the search node untouched', async () => {
      await buildAtLinkParagraph(editor)

      await setRange({ segment: 'search', offset: 0 }, { segment: 'search', offset: 2 })

      expect(readRangePoints(editor)).toEqual({
        anchor: { nodeType: 'at-link-search', offset: 0 },
        focus: { nodeType: 'at-link-search', offset: 2 },
      })
      expect(editor.getEditorState().toJSON()).toEqual(
        editorStateJSON(paragraphJSON([textNodeJSON('hello '), atLinkNodeJSON(null, 'abc'), textNodeJSON(' world')])),
      )
    })

    it('leaves a range wholly outside the at-link (spanning it entirely) untouched', async () => {
      await buildAtLinkParagraph(editor)

      await setRange({ segment: 'before', offset: 1 }, { segment: 'after', offset: 2 })

      expect(readRangePoints(editor)).toEqual({
        anchor: { nodeType: 'text', offset: 1 },
        focus: { nodeType: 'text', offset: 2 },
      })
      // the at-link survives as a unit — a range deletion removes it whole
      expect(editor.getEditorState().toJSON()).toEqual(
        editorStateJSON(paragraphJSON([textNodeJSON('hello '), atLinkNodeJSON(null, 'abc'), textNodeJSON(' world')])),
      )
    })
  })

  describe('$commitAtLinkSelection', () => {
    it('replaces an in-text at-link with a link node carrying the @ format, and resets the session', async () => {
      await buildSingleParagraph(editor, [{ text: 'hello ', format: 1 }], { segment: 0, anchorOffset: 6 })
      expect(await dispatchCommand(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '@')).toBe(true)
      await drainEnqueuedUpdates(editor, () => {
        const searchNode = $nodesOfType(AtLinkNode)[0].getChildAtIndex(1)
        if (searchNode instanceof AtLinkSearchNode) {
          searchNode.setTextContent('Emo')
          searchNode.selectEnd()
        }
      })

      let result: AtLinkCommitResult | null = null
      await drainEnqueuedUpdates(editor, () => {
        result = $commitAtLinkSelection($nodesOfType(AtLinkNode)[0], {
          label: 'Emoji autocomplete',
          value: 'https://example.com/emoji',
        })
      })

      expect(result).toEqual({ isBookmark: false })
      expect(editor.getEditorState().toJSON()).toEqual(
        editorStateJSON(
          paragraphJSON(
            [textNodeJSON('hello ', 1), linkNodeJSON('Emoji autocomplete', 'https://example.com/emoji', 1)],
            1,
          ),
        ),
      )
      expect(readCollapsedPoint(editor)).toEqual({ nodeType: 'text', offset: 18, text: 'Emoji autocomplete' })
      expect(lastSession()).toEqual({ focusedNode: null, query: '' })
    })

    it('replaces a lone at-link with a bookmark card', async () => {
      await buildSingleParagraph(editor, [], 'element')
      expect(await dispatchCommand(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '@')).toBe(true)

      let result: AtLinkCommitResult | null = null
      await drainEnqueuedUpdates(editor, () => {
        result = $commitAtLinkSelection($nodesOfType(AtLinkNode)[0], {
          label: 'Inkling',
          value: 'https://inkling.local',
        })
      })

      expect(result).toEqual({ isBookmark: true })
      editor.getEditorState().read(() => {
        const paragraph = $getRoot().getFirstChild()
        const bookmark = $isElementNode(paragraph) ? paragraph.getFirstChild() : null
        expect(bookmark?.getType()).toBe('bookmark')
      })
    })

    it('returns null for a detached at-link node', async () => {
      let result: AtLinkCommitResult | null | 'unset' = 'unset'
      await drainEnqueuedUpdates(editor, () => {
        result = $commitAtLinkSelection($createAtLinkNode(), { label: 'x', value: 'https://example.com' })
      })

      expect(result).toBeNull()
    })
  })
})
