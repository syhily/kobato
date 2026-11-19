import type { LexicalEditor } from 'lexical'

import { getSelectedNode } from '@kobato/inkling-internal/utils/get-selected-node'
import { $createParagraphNode, $getSelection, $isParagraphNode, $isRangeSelection } from 'lexical'

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

export interface SlashPressEvent {
  key: string
  isComposing: boolean
  ctrlKey: boolean
  metaKey: boolean
}

export function isSlashTriggerPress(editor: LexicalEditor, event: SlashPressEvent): boolean {
  const { key, isComposing, ctrlKey, metaKey } = event

  if (key !== '/' || isComposing || ctrlKey || metaKey) {
    return false
  }

  const rootElement = editor.getRootElement()
  if (!rootElement?.matches(':focus')) {
    return false
  }
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) {
      return false
    }
    const node = getSelectedNode(selection).getTopLevelElement()

    if (!node || !$isParagraphNode(node)) {
      return false
    }

    const paragraphSize = node.getTextContentSize()
    const isEmptyParagraph = selection.isCollapsed() && node.getTextContent() === ''
    const isFullParagraphSelection =
      !selection.isCollapsed() &&
      ((selection.anchor.offset === 0 && selection.focus.offset === paragraphSize) ||
        (selection.anchor.offset === paragraphSize && selection.focus.offset === 0))

    return isEmptyParagraph || isFullParagraphSelection
  })
}

export type SlashMenuVerdict =
  | { type: 'query'; query: string; commandParams: string[]; cursorRange: Range | null }
  | { type: 'close' }

export interface SlashCardMenuTriggerHandlers {
  onVerdict: (verdict: SlashMenuVerdict) => void
}

function resolveSlashMenuVerdict(editor: LexicalEditor): SlashMenuVerdict | null {
  return editor.getEditorState().read(() => {
    if (editor.isComposing()) {
      return null
    }
    const selection = $getSelection()
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
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

    const command = node.getTextContent().slice(1)
    const [query, ...commandParams] = command.split(' ')

    return { type: 'query', query, commandParams, cursorRange: nativeSelection?.getRangeAt(0) ?? null }
  })
}

export function registerSlashCardMenuTrigger(
  editor: LexicalEditor,
  { onVerdict }: SlashCardMenuTriggerHandlers,
): () => void {
  return registerTriggerUpdates(editor, () => resolveSlashMenuVerdict(editor), onVerdict)
}

export type PlusButtonVerdict = { type: 'show'; paragraph: Element } | { type: 'hide' }

export interface PlusCardMenuTriggerHandlers {
  onVerdict: (verdict: PlusButtonVerdict) => void
}

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

export function registerPlusCardMenuTrigger(
  editor: LexicalEditor,
  { onVerdict }: PlusCardMenuTriggerHandlers,
): () => void {
  return registerTriggerUpdates(editor, () => resolvePlusCaretButtonVerdict(editor), onVerdict)
}

export function resolvePlusHoverButtonVerdict(
  editor: LexicalEditor,
  pageX: number,
  pageY: number,
): PlusButtonVerdict | null {
  const rootElement = editor.getRootElement()
  if (!rootElement) {
    return null
  }

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
