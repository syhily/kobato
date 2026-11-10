import type { LexicalEditor, PointType, TextNode } from 'lexical'

import { $createLinkNode } from '@lexical/link'
import { $insertFirst, mergeRegister } from '@lexical/utils'
import {
  $createTextNode,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $nodesOfType,
  COMMAND_PRIORITY_HIGH,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  DELETE_CHARACTER_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  KEY_ESCAPE_COMMAND,
  PASTE_COMMAND,
} from 'lexical'

import {
  $createAtLinkNode,
  $createAtLinkSearchNode,
  $createZWNJNode,
  $isAtLinkNode,
  $isAtLinkSearchNode,
  $isZWNJNode,
  AtLinkNode,
} from '@/inkling/nodes/base'
import { $createBookmarkNode } from '@/inkling/nodes/BookmarkNode'
import { editorOwnsFocus } from '@/inkling/plugins/behaviour/card-adjacency'

// Headless half of the at-link plugin: node lifecycle (insertion, shape
// transform, command guards), the search session (registerAtLinkSession, the
// focused-node/query synchronization policy and selection clamps), and the
// commit surgery ($commitAtLinkSelection). The React half (AtLinkPlugin.tsx)
// is a pure adapter: it subscribes to session snapshots, renders the results
// popup, and delegates commits.
//
// Both insertion paths share $insertAtLink; keep these asymmetries:
// 1. The native before-regex (/(^|\s)@$/) includes the literal '@' because it
//    runs AFTER the browser inserted the character; the controlled check
//    ($shouldConvertAtLink) runs pre-insertion and must not see one.
// 2. The native predicate ($shouldConvertInsertedAt) accepts only text anchors
//    — the post-insertion selection is always text; the element-anchor branch
//    (empty paragraph) exists only in the pre-insertion path.
// 3. Both paths skip during composition (event.isComposing /
//    editor.isComposing()).
// 4. The paths are mutually exclusive in practice: a consumed controlled
//    command prevents DOM insertion, so no 'input' event fires. The native
//    listener is fallback-only; both registrations stay.
// 5. The link's carried format is captured at different moments: the
//    controlled path reads the anchor text node's format pre-insertion, the
//    native path reads it post-deletion inside $insertAtLink. They can differ
//    when the just-typed '@' was its own text node with a format unlike its
//    neighbors (bold toggled immediately before typing '@').

export function $removeAtLink(node: AtLinkNode, { focus = false } = {}) {
  if (!$isAtLinkNode(node)) {
    return
  }

  const searchNode = node.getChildAtIndex(1)
  if (!$isAtLinkSearchNode(searchNode)) {
    return
  }

  const textNode = $createTextNode('@' + searchNode.getTextContent())
  textNode.setFormat(node.getLinkFormat() ?? 0)
  node.replace(textNode)

  if (focus) {
    textNode.selectEnd()
  }
}

export interface AtLinkCommitResult {
  isBookmark: boolean
}

// Commit a chosen search result: replace the at-link node with a text link
// carrying the '@' character's format when it sits among other content, or with
// a bookmark card when it is the paragraph's only child. Returns the committed
// shape so the caller can attach product analytics; null when the node is
// detached (nothing committed).
export function $commitAtLinkSelection(
  node: AtLinkNode,
  { label, value }: { label: string; value: string },
): AtLinkCommitResult | null {
  const parent = node.getParent()
  if (!parent) {
    return null
  }

  const children = parent.getChildren()
  const isTextLink = children.length !== 1 || !$isAtLinkNode(children[0])

  if (isTextLink) {
    const linkNode = $createLinkNode(value)
    const textNode = $createTextNode(label)
    textNode.setFormat(node.getLinkFormat() ?? 0)
    linkNode.append(textNode)

    node.replace(linkNode)
    linkNode.selectEnd()

    return { isBookmark: false }
  }

  const bookmarkNode = $createBookmarkNode({
    url: value,
    title: label,
  })
  node.replace(bookmarkNode)
  bookmarkNode.selectEnd()

  return { isBookmark: true }
}

// The text surrounding a collapsed text anchor: the anchor node's own text
// sliced at the offset, folded with the previous/next sibling's text at the
// node's edges — sibling content must join the regex match when the caret sits
// at a node boundary. Shared by the pre-insertion and native predicates; they
// differ only in the before-regex.
function $textAroundAnchor(anchorNode: TextNode, anchorOffset: number) {
  let textBeforeAnchor = anchorNode.getTextContent().slice(0, anchorOffset)
  let textAfterAnchor = anchorNode.getTextContent().slice(anchorOffset)

  const prevSibling = anchorNode.getPreviousSibling()
  const nextSibling = anchorNode.getNextSibling()

  if (anchorOffset === 0 && $isTextNode(prevSibling)) {
    textBeforeAnchor = prevSibling.getTextContent()
  }

  if (anchorOffset === anchorNode.getTextContent().length && $isTextNode(nextSibling)) {
    textAfterAnchor = nextSibling.getTextContent()
  }

  return { textBeforeAnchor, textAfterAnchor }
}

function $shouldConvertAtLink(): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false
  }

  const anchor = selection.anchor

  if (anchor.type === 'element') {
    // the same around-the-caret idea as $textAroundAnchor, over child indices
    // instead of a sliced text node — the empty-paragraph shape exists only on
    // this pre-insertion path
    const anchorNode = anchor.getNode()
    if (!$isElementNode(anchorNode)) {
      return false
    }
    const child = anchorNode.getChildAtIndex(anchor.offset)
    const prevChild = anchor.offset > 0 ? anchorNode.getChildAtIndex(anchor.offset - 1) : null

    let textBeforeAnchor = ''
    let textAfterAnchor = ''

    if ($isTextNode(prevChild)) {
      textBeforeAnchor = prevChild.getTextContent()
    }
    if ($isTextNode(child)) {
      textAfterAnchor = child.getTextContent()
    }

    return (textBeforeAnchor === '' || /\s$/.test(textBeforeAnchor)) && /^($|\s|\.)/.test(textAfterAnchor)
  }

  if (anchor.type !== 'text') {
    return false
  }

  const anchorNode = anchor.getNode()
  if (!anchorNode.isSimpleText()) {
    return false
  }

  const { textBeforeAnchor, textAfterAnchor } = $textAroundAnchor(anchorNode, anchor.offset)

  return (textBeforeAnchor === '' || /\s$/.test(textBeforeAnchor)) && /^($|\s|\.)/.test(textAfterAnchor)
}

function $insertAtLink(): boolean {
  if (!$shouldConvertAtLink()) {
    return false
  }

  const selection = $getSelection()
  if (!$isRangeSelection(selection)) {
    return false
  }

  let linkFormat = 0
  const anchorNode = selection.anchor.getNode()
  if ($isTextNode(anchorNode)) {
    linkFormat = anchorNode.getFormat()
  }

  const atLinkNode = $createAtLinkNode()
  atLinkNode.setLinkFormat(linkFormat)
  atLinkNode.append($createZWNJNode())
  atLinkNode.append($createAtLinkSearchNode(''))

  const anchor = selection.anchor
  if (anchor.type === 'element' && $isElementNode(anchorNode)) {
    const targetChild = anchorNode.getChildAtIndex(anchor.offset)
    if (targetChild) {
      targetChild.insertBefore(atLinkNode)
    } else {
      anchorNode.append(atLinkNode)
    }
  } else {
    selection.insertNodes([atLinkNode])
  }

  atLinkNode.select(1, 1)

  const searchNode = atLinkNode.getChildAtIndex(1)
  const rangeSelection = $getSelection()
  if ($isAtLinkSearchNode(searchNode) && $isRangeSelection(rangeSelection)) {
    rangeSelection.anchor.set(searchNode.getKey(), 0, 'text')
    rangeSelection.focus.set(searchNode.getKey(), 0, 'text')
  }

  return true
}

// Detection predicate for the native fallback: should a just-inserted '@'
// become an at-link? Text anchors only — the post-insertion selection is always
// text.
function $shouldConvertInsertedAt(): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false
  }

  const anchor = selection.anchor
  if (anchor.type !== 'text') {
    return false
  }

  const anchorNode = anchor.getNode()
  if (!anchorNode.isSimpleText()) {
    return false
  }

  const { textBeforeAnchor, textAfterAnchor } = $textAroundAnchor(anchorNode, anchor.offset)

  const textBeforeRegExp = /(^|\s)@$/
  const textAfterRegExp = /^($|\s|\.)/

  return textBeforeRegExp.test(textBeforeAnchor) && textAfterRegExp.test(textAfterAnchor)
}

// Native 'input' fallback for the rare case where Lexical lets the browser
// insert text without dispatching CONTROLLED_TEXT_INSERTION_COMMAND.
// Detection-only: the update phase deletes the just-inserted '@' and
// delegates to the shared $insertAtLink.
function registerNativeAtLinkInsertion(editor: LexicalEditor) {
  const rootElement = editor.getRootElement()
  if (!rootElement) {
    return () => {
      /* noop — no root element, nothing was registered */
    }
  }

  const handleAtInsert = (event: Event) => {
    if (!(event instanceof InputEvent)) {
      return
    }

    if (event.isComposing) {
      return
    }

    if (event.inputType === 'insertText' && event.data === '@') {
      const replaceAt = editor.getEditorState().read(() => $shouldConvertInsertedAt())

      if (replaceAt) {
        editor.update(() => {
          // selection should now be where the '@' character was
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) {
            return
          }

          // delete the '@' character — the post-deletion state equals the
          // pre-insertion state the controlled path sees, so the shared
          // insert's own $shouldConvertAtLink() re-check passes
          selection.deleteCharacter(true)

          $insertAtLink()
        })
      }
    }
  }

  rootElement.addEventListener('input', handleAtInsert)

  return () => {
    rootElement.removeEventListener('input', handleAtInsert)
  }
}

// Convert a typed '@' into an at-link node, via Lexical's controlled
// text-insertion command (so the conversion works regardless of whether the
// browser fires a native 'input' event) with the native listener as fallback.
export function registerAtLinkInsertion(editor: LexicalEditor) {
  return mergeRegister(
    editor.registerCommand(
      CONTROLLED_TEXT_INSERTION_COMMAND,
      (eventOrText) => {
        if (editor.isComposing()) {
          return false
        }

        const inputType = typeof eventOrText === 'string' ? 'insertText' : eventOrText.inputType
        const data = typeof eventOrText === 'string' ? eventOrText : eventOrText.data

        if (inputType !== 'insertText' || data !== '@') {
          return false
        }

        return $insertAtLink()
      },
      COMMAND_PRIORITY_HIGH,
    ),
    registerNativeAtLinkInsertion(editor),
  )
}

// Command guards while an at-link-search node is focused.
export function registerAtLinkGuards(editor: LexicalEditor) {
  function $skipFormatCommandIfNeeded() {
    const selection = $getSelection()
    if ($isRangeSelection(selection) && $isAtLinkSearchNode(selection.anchor.getNode())) {
      return true
    }
    return false
  }

  return mergeRegister(
    // revert to '@' when pressing escape with a focused at-link node
    editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          const anchorNode = selection.anchor.getNode()
          if ($isAtLinkNode(anchorNode)) {
            $removeAtLink(anchorNode, { focus: true })
            return true
          }
          if ($isAtLinkSearchNode(anchorNode) || $isZWNJNode(anchorNode)) {
            const parent = anchorNode.getParent()
            if (!$isAtLinkNode(parent)) {
              return false
            }
            $removeAtLink(parent, { focus: true })
            return true
          }
        }
        return false
      },
      COMMAND_PRIORITY_HIGH,
    ),
    // revert to '@' when backspacing or deleting chars at the beginning/end of an at-link node
    editor.registerCommand(
      DELETE_CHARACTER_COMMAND,
      (isBackward) => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          const anchorNode = selection.anchor.getNode()
          if ($isAtLinkSearchNode(anchorNode) || $isZWNJNode(anchorNode)) {
            const parent = anchorNode.getParent()
            if (!$isAtLinkNode(parent)) {
              return false
            }
            const anchorOffset = selection.anchor.offset
            if (isBackward && anchorOffset === 0) {
              $removeAtLink(parent, { focus: true })
              return true
            }
            if (!isBackward && anchorOffset === anchorNode.getTextContentSize()) {
              $removeAtLink(parent, { focus: true })
              return true
            }
          }
        }
        return false
      },
      COMMAND_PRIORITY_HIGH,
    ),
    // prevent formatting commands when an at-link-search node is focused
    editor.registerCommand(FORMAT_TEXT_COMMAND, $skipFormatCommandIfNeeded, COMMAND_PRIORITY_HIGH),
    editor.registerCommand(FORMAT_ELEMENT_COMMAND, $skipFormatCommandIfNeeded, COMMAND_PRIORITY_HIGH),
    // prevent paste in the search node triggering external paste handlers.
    // COMMAND_PRIORITY_HIGH is load-bearing: it must pre-empt
    // registerPasteHandler's COMMAND_PRIORITY_LOW PASTE_COMMAND handler.
    editor.registerCommand(
      PASTE_COMMAND,
      (clipboardEvent) => {
        const selection = $getSelection()

        if (!$isRangeSelection(selection) || !editorOwnsFocus(editor)) {
          return false
        }

        if (!(clipboardEvent instanceof ClipboardEvent)) {
          return false
        }

        const clipboardData = clipboardEvent.clipboardData
        if (!clipboardData) {
          return false
        }

        const anchorNode = selection.anchor.getNode()
        if ($isAtLinkNode(anchorNode) || $isAtLinkSearchNode(anchorNode)) {
          clipboardEvent.preventDefault()

          const atLinkSearchNode = $isAtLinkSearchNode(anchorNode) ? anchorNode : anchorNode.getChildAtIndex(1)
          const text = clipboardData.getData('text/plain')

          if (text && $isAtLinkSearchNode(atLinkSearchNode)) {
            atLinkSearchNode.setTextContent(atLinkSearchNode.getTextContent() + text)
            atLinkSearchNode.selectEnd()
          }

          return true
        }
        return false
      },
      COMMAND_PRIORITY_HIGH,
    ),
  )
}

// Transform to ensure at-link node trees are valid.
export function registerAtLinkNodeTransform(editor: LexicalEditor) {
  return editor.registerNodeTransform(AtLinkNode, (atLinkNode) => {
    // first child must always be a ZWNJ
    if (!$isZWNJNode(atLinkNode.getFirstChild())) {
      const zwnjNode = $createZWNJNode()
      $insertFirst(atLinkNode, zwnjNode)
    }

    // second child must be a search node
    if (!$isAtLinkSearchNode(atLinkNode.getChildAtIndex(1))) {
      const atLinkSearchNode = $createAtLinkSearchNode('')
      atLinkNode.append(atLinkSearchNode)
    }

    // keep one search node: remove or replace non-search nodes
    atLinkNode.getChildren().forEach((child, index) => {
      if (index > 0 && !$isAtLinkSearchNode(child)) {
        const text = child.getTextContent()

        if (!text) {
          child.remove()
        } else {
          const atLinkSearchNode = $createAtLinkSearchNode(text)
          child.replace(atLinkSearchNode)
        }
      }
    })

    // consolidate the search nodes from the step above into one
    const searchNode = atLinkNode.getChildAtIndex(1)
    if (!$isAtLinkSearchNode(searchNode)) {
      return
    }
    const currentText = searchNode.getTextContent()
    let consolidatedText = currentText
    atLinkNode.getChildren().forEach((child, index) => {
      if (index > 1) {
        consolidatedText += child.getTextContent()
        child.remove()
      }
    })
    if (consolidatedText !== currentText) {
      searchNode.setTextContent(consolidatedText)
    }
  })
}

export interface AtLinkSessionSnapshot {
  focusedNode: AtLinkNode | null
  query: string
}

interface RegisterAtLinkSessionOptions {
  onSessionChange: (snapshot: AtLinkSessionSnapshot) => void
}

// The at-link node containing a selection point (the point's node or its
// parent), shared by the collapsed-focus tracking and the range-span clamp.
function $getContainingAtLinkNode(point: PointType): AtLinkNode | null {
  const node = point.getNode()
  if ($isAtLinkNode(node)) {
    return node
  }
  const parent = node.getParent()
  return $isAtLinkNode(parent) ? parent : null
}

// The at-link search session: owns the synchronization policy between the node
// tree and the consumer's focused-node/query state — unfocused-node removal,
// query extraction from the at-link-search node text, ZWNJ caret normalization,
// empty-search backspace removal, and the range-span clamp. The consumer (the
// React adapter) receives { focusedNode, query } snapshots and holds no policy
// of its own.
export function registerAtLinkSession(editor: LexicalEditor, { onSessionChange }: RegisterAtLinkSessionOptions) {
  let focusedNode: AtLinkNode | null = null
  let query = ''

  const emitSession = (node: AtLinkNode | null, nextQuery: string) => {
    // key-based change guard: consumers render/track by key, so a
    // cloned-but-equivalent node instance is not a session change
    if (node?.getKey() === focusedNode?.getKey() && nextQuery === query) {
      return
    }
    focusedNode = node
    query = nextQuery
    onSessionChange({ focusedNode: node, query: nextQuery })
  }

  return editor.registerUpdateListener(({ dirtyLeaves, dirtyElements }) => {
    if (editor.isComposing()) {
      return
    }

    // Skip the full-tree at-link scan unless an at-link is active or the update
    // touched nodes that could contain one — the focusedNode check keeps the
    // removal path working, since a selection change away from an at-link has
    // empty dirty sets.
    if (!focusedNode && dirtyLeaves.size === 0 && dirtyElements.size === 0) {
      return
    }

    editor.update(() => {
      const atLinkNodes = $nodesOfType(AtLinkNode)
      const selection = $getSelection()

      // no range selection: no cursor inside an at-link node — remove all of them
      if (!$isRangeSelection(selection)) {
        atLinkNodes.forEach((atLinkNode) => $removeAtLink(atLinkNode))
        emitSession(null, '')
        return
      }

      // collapsed selection: remove unfocused at-link nodes (cursor moved out)
      if (selection.isCollapsed()) {
        const selectedAtLinkNode = $getContainingAtLinkNode(selection.anchor)

        atLinkNodes.forEach((atLinkNode) => {
          if (atLinkNode !== selectedAtLinkNode) {
            $removeAtLink(atLinkNode)
          }
        })

        if (selectedAtLinkNode) {
          // at-link nodes always hold a ZWNJ node followed by a search node; emit its text as the query
          const searchNode = selectedAtLinkNode.getChildAtIndex(1)
          const searchNodeText = $isAtLinkSearchNode(searchNode) ? searchNode.getTextContent() : ''
          emitSession(selectedAtLinkNode, searchNodeText)

          // normalize the selection into the search node when it lands on the ZWNJ
          // (text backspaced to empty)
          if ($isZWNJNode(selection.focus.getNode()) && window.getSelection()?.anchorOffset === 0) {
            selectedAtLinkNode.select(1, 1)
            const rangeSelection = $getSelection()
            if ($isRangeSelection(rangeSelection) && $isAtLinkSearchNode(searchNode)) {
              rangeSelection.anchor.set(searchNode.getKey(), 0, 'text')
              rangeSelection.focus.set(searchNode.getKey(), 0, 'text')
            }
          }

          // if the search node is already empty but active, remove the at-link node on backspace
          if (searchNodeText === '' && $isZWNJNode(selection.anchor.getNode())) {
            $removeAtLink(selectedAtLinkNode, { focus: true })
          }
        } else {
          // search node isn't focused, reset the session
          emitSession(null, '')
        }

        return
      }

      // A range selection must not span outside an at-link node: with one
      // endpoint inside and the other outside, delete/format commands would
      // operate across the node boundary and leave a broken half-node. Clamp the
      // outside endpoint(s) to the search node's nearest edge; selections wholly
      // inside or wholly outside one at-link node are left alone.
      const anchorAtLinkNode = $getContainingAtLinkNode(selection.anchor)
      const focusAtLinkNode = $getContainingAtLinkNode(selection.focus)

      if (anchorAtLinkNode === focusAtLinkNode) {
        return
      }

      const atLinkNode = anchorAtLinkNode ?? focusAtLinkNode
      const searchNode = atLinkNode?.getChildAtIndex(1)
      if (!atLinkNode || !$isAtLinkSearchNode(searchNode)) {
        return
      }

      const clampToSearchEdge = (point: PointType) => {
        // document-order approximation: a point on an ancestor element
        // reads as "before" — either edge satisfies the invariant
        const offset = atLinkNode.isBefore(point.getNode()) ? searchNode.getTextContentSize() : 0
        point.set(searchNode.getKey(), offset, 'text')
      }
      if (anchorAtLinkNode !== atLinkNode) {
        clampToSearchEdge(selection.anchor)
      }
      if (focusAtLinkNode !== atLinkNode) {
        clampToSearchEdge(selection.focus)
      }
    })
  })
}
