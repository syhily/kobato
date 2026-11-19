import { $isAtLinkSearchNode } from '@kobato/inkling-internal/nodes/base'
import { createComposerHandle, type ComposerHandle } from '@kobato/inkling-internal/plugins/behaviour/composer-handle'
import { getSelectedNode } from '@kobato/inkling-internal/utils/get-selected-node'
import { $isLinkNode, TOGGLE_LINK_COMMAND, type LinkNode } from '@lexical/link'
import {
  $createRangeSelection,
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
} from 'lexical'

// Link-editing flow — headless module owning the link apply/read/remove surgery
// and the floating-toolbar session, so the plugin and toolbar components are
// render/event adapters over it. The toolbar session is the one owner of
// toolbar truth (the hidden | text | link | snippet machine plus the
// hovered-link slot); createLinkHoverFeed and createToolbarRevealFeed keep DOM
// behaviour out of the toolbar components, and registerToolbarSelectionSync
// owns the selection classifier (composing skip, outside-editor close, at-link
// suppression, textSelected/href derivation).
//
// The $-functions must run inside editor.read()/editor.update().

export function $applyLinkToSelection(editor: LexicalEditor, url: string): void {
  editor.dispatchCommand(TOGGLE_LINK_COMMAND, url || null)
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) {
    return
  }
  const focusNode = selection.focus.getNode()
  if (!$isTextNode(focusNode)) {
    return
  }
  const collapsed = $createRangeSelection()
  collapsed.setTextNodeRange(focusNode, focusNode.getTextContentSize(), focusNode, focusNode.getTextContentSize())
  $setSelection(collapsed)
}

export function $getLinkHrefAtSelection(): string {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) {
    return ''
  }
  const anchorNode = getSelectedNode(selection)
  const parent = anchorNode.getParent()
  if ($isLinkNode(parent)) {
    return parent.getURL()
  }
  if ($isLinkNode(anchorNode)) {
    return anchorNode.getURL()
  }
  return ''
}

/**
 * Selects the link's full text so a subsequent edit applies to the whole link.
 * The range spans the link's text children because createRectsFromDOMRange
 * misbehaves on a bare link-node selection. Returns false when the link has no
 * text children to select.
 */
export function $selectLinkText(linkNode: LinkNode): boolean {
  const firstChild = linkNode.getFirstChild()
  const lastChild = linkNode.getLastChild()
  if (!firstChild || !lastChild || !$isTextNode(firstChild) || !$isTextNode(lastChild)) {
    return false
  }
  const selection = $createRangeSelection()
  selection.setTextNodeRange(firstChild, 0, lastChild, lastChild.getTextContentSize())
  $setSelection(selection)
  return true
}

export function $removeLink(editor: LexicalEditor, linkNode: LinkNode): void {
  linkNode.select()
  editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
}

export type ToolbarSessionType = 'hidden' | 'text' | 'link' | 'snippet'

export interface HoveredLink {
  linkNode: LinkNode
  href: string

  targetElem: HTMLElement
}

export interface ToolbarSessionState {
  type: ToolbarSessionType
  href: string

  hoveredLink: HoveredLink | null
}

export interface ToolbarSelectionSnapshot {
  textSelected: boolean
  href: string
}

/**
 * The floating-toolbar session state machine: hidden | text | link | snippet,
 * with the hovered-link slot fed alongside the selection.
 * - selection sync only acts while hidden/text — a link or snippet toolbar
 *   stays open across selection changes (its input steals the selection) and
 *   closes only through close() or an explicit open.
 * - a lost/invalid selection (syncSelection(null)) hides the text toolbar.
 * - explicit opens (cmd-K, format-toolbar buttons, edit-link) work from any state.
 * - hover sync only acts while hidden — entering any toolbar state clears the
 *   hovered link and syncHover is ignored until the session is hidden again.
 * The handle serves the React adapter's useSyncExternalStore binding; non-React
 * drivers go through the methods.
 */
export function createToolbarSession(
  handle: ComposerHandle<ToolbarSessionState> = createComposerHandle<ToolbarSessionState>({
    type: 'hidden',
    href: '',
    hoveredLink: null,
  }),
) {
  return {
    handle,

    syncSelection(snapshot: ToolbarSelectionSnapshot | null) {
      const { type } = handle.getState()
      if (type === 'link' || type === 'snippet') {
        return
      }
      if (!snapshot) {
        handle.setState({ type: 'hidden' })
        return
      }
      handle.setState(
        snapshot.textSelected
          ? { type: 'text', href: snapshot.href, hoveredLink: null }
          : { type: 'hidden', href: snapshot.href },
      )
    },

    syncHover(hoveredLink: HoveredLink | null) {
      if (handle.getState().type !== 'hidden') {
        return
      }
      const current = handle.getState().hoveredLink
      // swallow re-feeds of the same link over the same element so a debounced
      // mousemove stream does not churn subscribers with equal states
      if (
        current &&
        hoveredLink &&
        current.linkNode === hoveredLink.linkNode &&
        current.targetElem === hoveredLink.targetElem
      ) {
        return
      }
      handle.setState({ hoveredLink })
    },

    openLink(href?: string) {
      handle.setState(
        href === undefined ? { type: 'link', hoveredLink: null } : { type: 'link', href, hoveredLink: null },
      )
    },

    openSnippet() {
      handle.setState({ type: 'snippet', hoveredLink: null })
    },

    close() {
      handle.setState({ type: 'hidden', hoveredLink: null })
    },
  }
}

export type ToolbarSession = ReturnType<typeof createToolbarSession>

export function registerToolbarSelectionSync(editor: LexicalEditor, session: ToolbarSession): () => void {
  const syncToolbarToSelection = () => {
    editor.getEditorState().read(() => {
      if (editor.isComposing()) {
        return
      }
      const selection = $getSelection()
      const nativeSelection = window.getSelection()
      const rootElement = editor.getRootElement()
      if (
        nativeSelection !== null &&
        (!$isRangeSelection(selection) || rootElement === null || !rootElement.contains(nativeSelection.anchorNode))
      ) {
        session.syncSelection(null)
        return
      }

      if (!$isRangeSelection(selection) || $isAtLinkSearchNode(selection.anchor.getNode())) {
        session.syncSelection(null)
        return
      }

      const anchorNode = getSelectedNode(selection)
      const textSelected =
        selection.getTextContent().trim() !== '' && ($isTextNode(anchorNode) || $isParagraphNode(anchorNode))
      session.syncSelection({ textSelected, href: $getLinkHrefAtSelection() })
    })
  }

  document.addEventListener('selectionchange', syncToolbarToSelection)
  return () => {
    document.removeEventListener('selectionchange', syncToolbarToSelection)
  }
}

export const LINK_HOVER_DEBOUNCE_MS = 50

export interface LinkHoverFeedPorts {
  getToolbarElement: () => HTMLElement | null
}

export interface LinkHoverFeed {
  hover: (target: EventTarget | null) => void
}

export function createLinkHoverFeed(
  editor: LexicalEditor,
  session: ToolbarSession,
  { getToolbarElement }: LinkHoverFeedPorts,
): LinkHoverFeed {
  return {
    hover(target) {
      const toolbarElement = getToolbarElement()
      if (toolbarElement && target instanceof Node && toolbarElement.contains(target)) {
        return
      }
      if (session.handle.getState().type !== 'hidden') {
        return
      }
      if (!(target instanceof HTMLElement)) {
        return
      }
      editor.read(() => {
        const node = $getNearestNodeFromDOMNode(target)
        const parentNode = node?.getParent()
        const linkNode = $isLinkNode(node) ? node : $isLinkNode(parentNode) ? parentNode : null
        session.syncHover(linkNode ? { linkNode, href: linkNode.getURL(), targetElem: target } : null)
      })
    },
  }
}

export const REVEAL_MOVE_THRESHOLD = 5

export interface RevealPoint {
  x: number
  y: number
}

export interface ToolbarRevealFeedPorts {
  reveal: () => void
}

export interface ToolbarRevealFeed {
  move: (point: RevealPoint, buttons: number) => void

  release: (target: EventTarget | null) => void
}

export function createToolbarRevealFeed(editor: LexicalEditor, { reveal }: ToolbarRevealFeedPorts): ToolbarRevealFeed {
  let initialPosition: RevealPoint | null = null
  return {
    move(point, buttons) {
      if (buttons > 0) {
        return
      }

      if (!initialPosition) {
        initialPosition = point
      }
      const distanceMoved = Math.sqrt(
        Math.pow(point.x - initialPosition.x, 2) + Math.pow(point.y - initialPosition.y, 2),
      )

      if (distanceMoved < REVEAL_MOVE_THRESHOLD) {
        return
      }
      initialPosition = null
      editor.read(() => {
        const selection = $getSelection()
        if (selection === null || !$isRangeSelection(selection)) {
          return
        }
        reveal()
      })
    },
    release(target) {
      editor.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          return
        }
        const selectedNodeMatchesTarget = selection.getNodes().find((node) => {
          const element = editor.getElementByKey(node.getKey())
          return element && target instanceof Node && (element.contains(target) || target.contains(element))
        })
        if (selectedNodeMatchesTarget) {
          reveal()
        }
      })
    },
  }
}

export function isLinkShortcutPress(event: KeyboardEvent): boolean {
  return !event.shiftKey && event.code === 'KeyK' && (event.ctrlKey || event.metaKey)
}

export function registerToolbarCommands(editor: LexicalEditor, session: ToolbarSession): () => void {
  return editor.registerCommand(
    KEY_DOWN_COMMAND,
    (event: KeyboardEvent) => {
      if (isLinkShortcutPress(event)) {
        const selection = $getSelection()
        if ($isRangeSelection(selection) && !selection.isCollapsed()) {
          session.openLink()
          event.preventDefault()
          return true
        }
      }
      return false
    },
    COMMAND_PRIORITY_LOW,
  )
}
