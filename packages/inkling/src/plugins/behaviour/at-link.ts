import type { LexicalEditor, PointType, TextNode } from 'lexical'

import {
  $createAtLinkNode,
  $createAtLinkSearchNode,
  $createZWNJNode,
  $isAtLinkNode,
  $isAtLinkSearchNode,
  $isZWNJNode,
  AtLinkNode,
} from '@kobato/inkling-internal/nodes/base'
import { $createBookmarkNode } from '@kobato/inkling-internal/nodes/BookmarkNode'
import { editorOwnsFocus } from '@kobato/inkling-internal/plugins/behaviour/card-adjacency'
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

function registerNativeAtLinkInsertion(editor: LexicalEditor) {
  const rootElement = editor.getRootElement()
  if (!rootElement) {
    return () => undefined
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
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) {
            return
          }

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

export function registerAtLinkGuards(editor: LexicalEditor) {
  function $skipFormatCommandIfNeeded() {
    const selection = $getSelection()
    if ($isRangeSelection(selection) && $isAtLinkSearchNode(selection.anchor.getNode())) {
      return true
    }
    return false
  }

  return mergeRegister(
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

    editor.registerCommand(FORMAT_TEXT_COMMAND, $skipFormatCommandIfNeeded, COMMAND_PRIORITY_HIGH),
    editor.registerCommand(FORMAT_ELEMENT_COMMAND, $skipFormatCommandIfNeeded, COMMAND_PRIORITY_HIGH),
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

export function registerAtLinkNodeTransform(editor: LexicalEditor) {
  return editor.registerNodeTransform(AtLinkNode, (atLinkNode) => {
    if (!$isZWNJNode(atLinkNode.getFirstChild())) {
      const zwnjNode = $createZWNJNode()
      $insertFirst(atLinkNode, zwnjNode)
    }

    if (!$isAtLinkSearchNode(atLinkNode.getChildAtIndex(1))) {
      const atLinkSearchNode = $createAtLinkSearchNode('')
      atLinkNode.append(atLinkSearchNode)
    }

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

function $getContainingAtLinkNode(point: PointType): AtLinkNode | null {
  const node = point.getNode()
  if ($isAtLinkNode(node)) {
    return node
  }
  const parent = node.getParent()
  return $isAtLinkNode(parent) ? parent : null
}

export function registerAtLinkSession(editor: LexicalEditor, { onSessionChange }: RegisterAtLinkSessionOptions) {
  let focusedNode: AtLinkNode | null = null
  let query = ''
  const emitSession = (node: AtLinkNode | null, nextQuery: string) => {
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
    if (!focusedNode && dirtyLeaves.size === 0 && dirtyElements.size === 0) {
      return
    }

    editor.update(() => {
      const atLinkNodes = $nodesOfType(AtLinkNode)
      const selection = $getSelection()

      if (!$isRangeSelection(selection)) {
        atLinkNodes.forEach((atLinkNode) => $removeAtLink(atLinkNode))
        emitSession(null, '')
        return
      }

      if (selection.isCollapsed()) {
        const selectedAtLinkNode = $getContainingAtLinkNode(selection.anchor)

        atLinkNodes.forEach((atLinkNode) => {
          if (atLinkNode !== selectedAtLinkNode) {
            $removeAtLink(atLinkNode)
          }
        })

        if (selectedAtLinkNode) {
          const searchNode = selectedAtLinkNode.getChildAtIndex(1)
          const searchNodeText = $isAtLinkSearchNode(searchNode) ? searchNode.getTextContent() : ''
          emitSession(selectedAtLinkNode, searchNodeText)

          if ($isZWNJNode(selection.focus.getNode()) && window.getSelection()?.anchorOffset === 0) {
            selectedAtLinkNode.select(1, 1)
            const rangeSelection = $getSelection()
            if ($isRangeSelection(rangeSelection) && $isAtLinkSearchNode(searchNode)) {
              rangeSelection.anchor.set(searchNode.getKey(), 0, 'text')
              rangeSelection.focus.set(searchNode.getKey(), 0, 'text')
            }
          }

          if (searchNodeText === '' && $isZWNJNode(selection.anchor.getNode())) {
            $removeAtLink(selectedAtLinkNode, { focus: true })
          }
        } else {
          emitSession(null, '')
        }

        return
      }

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
