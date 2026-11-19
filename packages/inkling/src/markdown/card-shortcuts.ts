// One seam for the trigger bodies of the typing shortcuts that turn a paragraph
// into a card. The trigger regexes live in the shared grammar table
// (`@kobato/inkling-internal/markdown/grammar`) and are re-exported below for this seam's
// import sites.
//
// - Code fence (```lang): three triggers — enter and tab
//   (`@kobato/inkling-internal/plugins/behaviour/keyboard-navigation`) share
//   `$fireFenceKeyboardShortcut`, and the `CODE_BLOCK` transformer calls
//   `$insertCodeBlockForShortcut` directly.
// - Horizontal rule (---): the `HR` transformer and the per-update scan in
//   `@kobato/inkling-internal/plugins/HorizontalRulePlugin`.
//
// Language extraction differs per fence trigger: the keyboard body takes the
// full rest of the line, the transformer its `match[1]` capture.
//
// The HR replace bodies stay per-trigger because their observable results
// diverge at the document end: the markdown trigger keeps the emptied
// paragraph after the rule, while the per-update scan creates a fresh one
// (different node identity, pinned in
// tests/inkling/unit/plugins/HorizontalRulePlugin.test.tsx); only the markdown
// trigger branches on import vs typing.
//
// Card classes resolve through the editor's registered-node map at call time
// (`$registeredCardClass`), never from the card shims: this module is reachable
// from the card-free core path (keyboard navigation is mounted by every
// InklingComposableEditor) and the shims drag in the decorate tree.

import { FENCE_KEYBOARD_REGEXP } from '@kobato/inkling-internal/markdown/grammar'
import { $selectDecoratorNode } from '@kobato/inkling-internal/utils'
import { getRegisteredNodeMap } from '@kobato/inkling-internal/utils/lexical-internals'
import {
  $createParagraphNode,
  $getEditor,
  $getSelection,
  $isTextNode,
  type ElementNode,
  type Klass,
  type LexicalNode,
} from 'lexical'

function $registeredCardClass(nodeType: string): Klass<LexicalNode> | undefined {
  return getRegisteredNodeMap($getEditor()).get(nodeType)?.klass
}

export function codeBlockFence(language: string, text: string): string {
  return '```' + language + (text ? '\n' + text : '') + '\n```'
}
/**
 * The one bracketing-fence strip for multiline-element import: `linesInBetween`
 * includes the (always empty) remainder of the opening fence line and the
 * (always empty) prefix of the closing fence line — drop both.
 */
export function stripFenceLines(linesInBetween: string[] | null | undefined): string {
  return linesInBetween?.slice(1, -1).join('\n') ?? ''
}

export function $insertCodeBlockForShortcut(topLevelElement: ElementNode, language: string | undefined): boolean {
  const CodeBlockNodeClass = $registeredCardClass('codeblock')
  if (!CodeBlockNodeClass) {
    return false
  }

  const replacementNode = topLevelElement.replace(new CodeBlockNodeClass({ language, _openInEditMode: true }))
  $selectDecoratorNode(replacementNode)
  return true
}

export function $fireFenceKeyboardShortcut(event: KeyboardEvent): boolean {
  const selection = $getSelection()
  const currentNode = selection?.getNodes()[0]
  if (!$isTextNode(currentNode)) {
    return false
  }
  const textContent = currentNode.getTextContent()
  if (!FENCE_KEYBOARD_REGEXP.test(textContent)) {
    return false
  }
  const topLevelElement = currentNode.getTopLevelElement()
  if (!topLevelElement) {
    return false
  }
  if (!$insertCodeBlockForShortcut(topLevelElement, textContent.replace(/^```/, ''))) {
    return false
  }
  event.preventDefault()
  return true
}

export const DIVIDER_REGEXP = /^(---|\*\*\*|___)\s?$/

export type MarkdownTriggerPhase = 'import' | 'typing'

/**
 * markdown transformer trigger (typing + import). On import, or when a next
 * sibling exists, the paragraph is replaced outright; at the document end on
 * a typing keystroke the (framework-emptied) paragraph is KEPT after the
 * rule so the caret has somewhere to land. A no-op when the editor doesn't
 * register the horizontal-rule card.
 */
export function $insertHorizontalRuleForMarkdownTrigger(parentNode: ElementNode, phase: MarkdownTriggerPhase): void {
  const HorizontalRuleNodeClass = $registeredCardClass('horizontalrule')
  if (!HorizontalRuleNodeClass) {
    return
  }
  const line = new HorizontalRuleNodeClass()

  if (phase === 'import' || parentNode.getNextSibling() !== null) {
    parentNode.replace(line)
  } else {
    parentNode.insertBefore(line)
  }
  line.selectNext()
}
/**
 * per-update scan trigger (HorizontalRulePlugin). Same sibling branch as the
 * markdown trigger, but at the document end it creates a FRESH paragraph
 * after the rule (the emptied one is discarded) — the observable divergence
 * that keeps these bodies per-trigger. A no-op when the editor doesn't
 * register the horizontal-rule card.
 */
export function $insertHorizontalRuleForUpdateScanTrigger(parentNode: ElementNode): void {
  const HorizontalRuleNodeClass = $registeredCardClass('horizontalrule')
  if (!HorizontalRuleNodeClass) {
    return
  }
  const line = new HorizontalRuleNodeClass()

  if (parentNode.getNextSibling()) {
    parentNode.replace(line)
  } else {
    parentNode.insertBefore(line)
    parentNode.replace($createParagraphNode())
  }

  line.selectNext()
}
