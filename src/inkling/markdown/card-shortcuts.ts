// One seam for the trigger bodies of the typing shortcuts that turn a paragraph
// into a card. The trigger regexes live in the shared grammar table
// (`@/inkling/markdown/grammar`) and are re-exported below for this seam's
// import sites.
//
// - Code fence (```lang): three triggers — enter and tab
//   (`@/inkling/plugins/behaviour/keyboard-navigation`) share
//   `$fireFenceKeyboardShortcut`, and the `CODE_BLOCK` transformer calls
//   `$insertCodeBlockForShortcut` directly.
// - Horizontal rule (---): the `HR` transformer and the per-update scan in
//   `@/inkling/plugins/HorizontalRulePlugin`.
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

import {
  $createParagraphNode,
  $getEditor,
  $getSelection,
  $isTextNode,
  type ElementNode,
  type Klass,
  type LexicalNode,
} from 'lexical'

import { FENCE_KEYBOARD_REGEXP } from '@/inkling/markdown/grammar'
import { $selectDecoratorNode } from '@/inkling/utils'
import { getRegisteredNodeMap } from '@/inkling/utils/lexical-internals'

/**
 * The registered class for a card node type, looked up on the active editor.
 * `undefined` when the editor doesn't register the card — every caller treats
 * that as "shortcut unavailable".
 */
function $registeredCardClass(nodeType: string): Klass<LexicalNode> | undefined {
  return getRegisteredNodeMap($getEditor()).get(nodeType)?.klass
}

/**
 * The one code-fence serialization: opening fence with language, body, closing
 * fence. Both export transformers delegate here so the fence shape cannot fork.
 */
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

/**
 * Replace the fence paragraph with a code block card and put a NodeSelection
 * on it so the card immediately renders in edit mode. Shared by the enter,
 * tab, and markdown-transformer triggers. Returns false — leaving the tree
 * untouched — when the editor doesn't register the code card.
 */
export function $insertCodeBlockForShortcut(topLevelElement: ElementNode, language: string | undefined): boolean {
  const CodeBlockNodeClass = $registeredCardClass('codeblock')
  if (!CodeBlockNodeClass) {
    return false
  }

  const replacementNode = topLevelElement.replace(new CodeBlockNodeClass({ language, _openInEditMode: true }))

  // A NodeSelection makes the card render in editing mode immediately
  // (keyboard-triggered: the caller already owns focus — the 'never' leg)
  $selectDecoratorNode(replacementNode)
  return true
}

/**
 * enter/tab keyboard trigger body: the caret text starts with a fence
 * (FENCE_KEYBOARD_REGEXP), so swap its paragraph for a code block card. Owns
 * the keyboard trigger's language extraction — the full rest of the line.
 * Returns true when the shortcut fired (event consumed); false when the caret
 * isn't on a fence line or the code card isn't registered, so the caller falls
 * through to its other key handling.
 */
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

/** divider trigger, single-sourced for both HR triggers. */
export const DIVIDER_REGEXP = /^(---|\*\*\*|___)\s?$/

/**
 * The phase a markdown transformer `replace` runs in, named at the seam
 * instead of threading `@lexical/markdown`'s `isImport` boolean through:
 * 'import' during `$convertFromMarkdownString`, 'typing' on a live shortcut
 * keystroke. Only the HR markdown trigger branches on it.
 */
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
