import type { LexicalEditor } from 'lexical'

import { $createParagraphNode, $getSelection, $isParagraphNode, $isRangeSelection } from 'lexical'

import { getSelectedNode } from '@/utils/getSelectedNode'

// Card-menu trigger — the headless half of the slash and plus card menus:
// the observe→extract→verdict loop both plugins used to re-implement as
// React effects. Editor state and DOM-selection/geometry facts come in
// through the resolvers below; typed verdicts go out — { query, close } for
// the slash menu, { show, hide } for the plus button — and a null resolution
// means "no verdict: leave the consumer's state as it is" (mid-composition,
// a selection inside the open menu, a hover outside the editor or over a
// card). The plugins keep only their DOM event wiring (slash keypress; plus
// mousemove/selectionchange), driving the popup through its handle — the
// session (cursor lease, close policy), the anchor chrome, and the rendering
// are CardMenuPopup's (src/plugins/CardMenuPopup.tsx), composing the session
// core (src/hooks/useCardMenuSession.ts), the slash trigger binding
// (src/hooks/useSlashCardMenuTrigger.ts), and the keyboard navigator
// (src/hooks/card-menu-navigation.ts).
//
// The two triggers differ on purpose (document why, don't flatten):
// 1. Slash is keypress-triggered: a '/' matching the valid-press grammar
//    (isSlashTriggerPress) opens the menu, which then tracks the '/query'
//    text in the trigger paragraph and closes when the selection leaves it
//    (resolveSlashMenuVerdict).
// 2. Plus is hover/caret-triggered: its button appears while the caret or
//    the mouse sits on an empty paragraph (resolvePlusCaretButtonVerdict /
//    resolvePlusHoverButtonVerdict); the menu itself opens from the button's
//    click, which stays plugin-side.
// Both registrations share the one loop skeleton (registerTriggerUpdates);
// per-trigger variance lives in the resolvers as data-shaped verdicts.

// The shared observe→emit loop: resolve the trigger's verdict on each editor
// update and emit it. A null resolution emits nothing — the consumer's state
// stays as it is.
function registerTriggerUpdates<V>(
  editor: LexicalEditor,
  resolve: () => V | null,
  onVerdict: (verdict: V) => void,
): () => void {
  return editor.registerUpdateListener(() => {
    const verdict = resolve()
    if (verdict !== null) {
      onVerdict(verdict)
    }
  })
}

// --- slash trigger ----------------------------------------------------------

export interface SlashPressEvent {
  key: string
  isComposing: boolean
  ctrlKey: boolean
  metaKey: boolean
}

// The valid-press grammar behind the slash menu's keypress wiring: a bare
// '/' — no modifiers, not mid-composition — with the editor focused and the
// selection either a collapsed caret on an empty top-level paragraph or a
// full-paragraph selection (the '/' replaces the paragraph text either way).
export function isSlashTriggerPress(editor: LexicalEditor, event: SlashPressEvent): boolean {
  const { key, isComposing, ctrlKey, metaKey } = event

  // we only care about / presses when not composing or pressed with modifiers
  if (key !== '/' || isComposing || ctrlKey || metaKey) {
    return false
  }

  // ignore if editor doesn't have focus
  const rootElement = editor.getRootElement()
  if (!rootElement?.matches(':focus')) {
    return false
  }

  // potentially valid / press
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) {
      return false
    }
    const node = getSelectedNode(selection).getTopLevelElement()

    // ignore if selection is not on a top-level paragraph
    if (!node || !$isParagraphNode(node)) {
      return false
    }

    const paragraphSize = node.getTextContentSize()
    const isEmptyParagraph = selection.isCollapsed() && node.getTextContent() === ''
    // if full paragraph is selected, pressing / will replace it so that's a valid press
    const isFullParagraphSelection =
      !selection.isCollapsed() &&
      ((selection.anchor.offset === 0 && selection.focus.offset === paragraphSize) ||
        (selection.anchor.offset === paragraphSize && selection.focus.offset === 0))

    return isEmptyParagraph || isFullParagraphSelection
  })
}

export type SlashMenuVerdict =
  // the caret sits in a '/query params' paragraph — track the typed query
  // and lease the cursor range so the session can restore it on Escape
  | { type: 'query'; query: string; commandParams: string[]; cursorRange: Range | null }
  // the selection left the slash-command paragraph — close the menu
  | { type: 'close' }

export interface SlashCardMenuTriggerHandlers {
  onVerdict: (verdict: SlashMenuVerdict) => void
}

// The slash menu's per-update policy: close when the selection has left the
// slash-command paragraph (a non-collapsed selection, a top-level element
// that isn't a '/'-paragraph, or a native caret that isn't a text node
// inside the editor); otherwise extract the query and command params from
// the paragraph text after '/'. Null when no verdict applies — mid-composition,
// or a non-collapsed native selection inside the open menu (clicking a menu
// section moves the DOM selection there; that is not a close).
function resolveSlashMenuVerdict(editor: LexicalEditor): SlashMenuVerdict | null {
  return editor.getEditorState().read(() => {
    // don't do anything when using IME input
    if (editor.isComposing()) {
      return null
    }

    const selection = $getSelection()

    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
      // don't close the menu if the selection is inside a card-menu section
      const anchorParent = window.getSelection()?.anchorNode?.parentNode
      const isMenuSection = anchorParent instanceof HTMLElement ? anchorParent.dataset.cardMenuSection : undefined

      if (isMenuSection) {
        return null
      }

      return { type: 'close' }
    }

    const node = getSelectedNode(selection).getTopLevelElement()

    if (!node || !$isParagraphNode(node) || !node.getTextContent().startsWith('/')) {
      return { type: 'close' }
    }

    const nativeSelection = window.getSelection()
    const anchorNode = nativeSelection?.anchorNode
    const rootElement = editor.getRootElement()

    if (anchorNode?.nodeType !== Node.TEXT_NODE || !rootElement?.contains(anchorNode)) {
      return { type: 'close' }
    }

    // capture text after the / as a query for filtering cards
    const command = node.getTextContent().slice(1)
    const [query, ...commandParams] = command.split(' ')

    return { type: 'query', query, commandParams, cursorRange: nativeSelection?.getRangeAt(0) ?? null }
  })
}

// Register the slash trigger's update loop: on each editor update, resolve
// and emit the menu verdict (query tracking or close). Returns the
// unregister callback.
export function registerSlashCardMenuTrigger(
  editor: LexicalEditor,
  { onVerdict }: SlashCardMenuTriggerHandlers,
): () => void {
  return registerTriggerUpdates(editor, () => resolveSlashMenuVerdict(editor), onVerdict)
}

// --- plus trigger -----------------------------------------------------------

export type PlusButtonVerdict =
  // anchor the button to this empty paragraph
  | { type: 'show'; paragraph: Element }
  // no valid anchor — hide the button
  | { type: 'hide' }

export interface PlusCardMenuTriggerHandlers {
  onVerdict: (verdict: PlusButtonVerdict) => void
}

// The plus button's caret policy: show the button anchored to the caret's
// paragraph when a collapsed selection sits in an empty paragraph and the
// native selection's anchor is that <p> element inside the editor; hide it
// for anything else. Null mid-composition — the button stays as it is.
function resolvePlusCaretButtonVerdict(editor: LexicalEditor): PlusButtonVerdict | null {
  return editor.getEditorState().read(() => {
    if (editor.isComposing()) {
      return null
    }

    const selection = $getSelection()

    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
      return { type: 'hide' }
    }

    const node = getSelectedNode(selection)

    if (!$isParagraphNode(node) || node.getTextContent() !== '') {
      return { type: 'hide' }
    }

    const p = window.getSelection()?.anchorNode
    const rootElement = editor.getRootElement()

    if (!p || !(p instanceof Element) || p.tagName !== 'P' || !rootElement?.contains(p)) {
      return { type: 'hide' }
    }

    return { type: 'show', paragraph: p }
  })
}

// Register the plus trigger's update loop: on each editor update, resolve
// and emit the caret-based button verdict. Returns the unregister callback.
export function registerPlusCardMenuTrigger(
  editor: LexicalEditor,
  { onVerdict }: PlusCardMenuTriggerHandlers,
): () => void {
  return registerTriggerUpdates(editor, () => resolvePlusCaretButtonVerdict(editor), onVerdict)
}

// The plus button's hover policy, resolved from a mousemove's page
// coordinates: hovering an empty <p> inside the editor shows the button
// anchored to it; hovering anything else inside the editor falls back to the
// caret policy; hovering outside the editor or over a card returns null —
// the button stays as it is.
export function resolvePlusHoverButtonVerdict(
  editor: LexicalEditor,
  pageX: number,
  pageY: number,
): PlusButtonVerdict | null {
  const rootElement = editor.getRootElement()
  if (!rootElement) {
    return null
  }

  // the left-gutter fudge: the plus button renders in the gutter left of the
  // editor column, so a mouse left of the container's left edge hovers
  // BESIDE a paragraph, not over one — nudge the hit-test point 40px inward
  // so elementFromPoint lands on that paragraph
  const containerRect = rootElement.getBoundingClientRect()
  const hitX = pageX < containerRect.left ? pageX + 40 : pageX

  const hoveredElem = document.elementFromPoint(hitX, pageY)

  if (!hoveredElem || !rootElement.contains(hoveredElem) || hoveredElem.closest('[data-inkling-card]')) {
    return null
  }

  if (hoveredElem.tagName === 'P' && hoveredElem.textContent === '') {
    return { type: 'show', paragraph: hoveredElem }
  }

  return resolvePlusCaretButtonVerdict(editor)
}

// The selectionchange hide rule: a native selection anchored outside the
// editor hides the button — except while the menu is open and the selection
// landed inside it (clicking a menu entry moves the DOM selection there, so
// the plugin passes its menu container only while the menu is showing).
export function shouldHidePlusButtonOnSelectionChange(
  anchorNode: Node | null,
  rootElement: HTMLElement | null,
  menuContainer: Element | null,
): boolean {
  if (menuContainer?.contains(anchorNode)) {
    return false
  }

  return !anchorNode || !rootElement?.contains(anchorNode)
}

/**
 * The slash-menu insert's trigger-paragraph swap (useCardMenu keeps the
 * type-erased dispatch): paragraphs at the beginning of the document delete
 * themselves via .collapseAtStart() when their contents are replaced, so
 * the trigger paragraph is swapped for a fresh empty one — selected — and
 * the insert command then replaces that selection with the new node. No-op
 * without a range selection. Runs inside editor.update.
 */
export function $swapTriggerParagraph(dispatch: () => void): void {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) {
    return
  }

  const focusPNode = selection.focus.getNode().getTopLevelElement()

  if (!focusPNode) {
    return
  }

  const paragraph = $createParagraphNode()
  focusPNode.insertAfter(paragraph)
  focusPNode.remove()
  paragraph.select()

  dispatch()
}
