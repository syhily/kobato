// Card shortcuts — one seam owning the trigger regexes and the
// replace-and-select bodies for the typing shortcuts that turn a paragraph
// into a card. The call sites keep only their trigger:
//
// - **Code fence** (```lang): fired by THREE triggers — the enter key and the
//   tab key (`@/plugins/behaviour/keyboard-navigation`), and the markdown
//   shortcut/import `CODE_BLOCK` transformer (`@/markdown/transformers`).
//   Enter and tab share one trigger body, `$fireFenceKeyboardShortcut` below;
//   the transformer calls `$insertCodeBlockForShortcut` directly.
// - **Horizontal rule** (---): fired by TWO triggers — the markdown
//   shortcut/import `HR` transformer (`@/markdown/transformers`) and the
//   per-update scan in `@/plugins/HorizontalRulePlugin`.
//
// The fence trigger regexes differ ON PURPOSE and are not flattened: the
// transformer regex ends in `\s` so it fires on the space keystroke while
// typing (and never claims a bare fence on import), while the keyboard regex
// lets enter/tab fire on the key regardless of trailing space. The keyboard
// regex is also not end-anchored, so its `(\w{1,10})` group caps nothing — a
// fence line whose language exceeds 10 word chars still transforms on
// enter/tab (pinned in test/unit/plugins/behaviour/registerKeyboardNavigation.test.ts).
// The regexes themselves are owned by the shared grammar table
// (`@/markdown/grammar`: keyboard / transformer / import policies), and
// re-exported below for this seam's historical import sites.
//
// Language extraction differs per trigger too: the keyboard trigger body
// takes the FULL rest of the line (`textContent.replace(/^```/, '')` — 'js
// extra' and all), the transformer takes the regex's `match[1]` capture at
// its own call site. The replace-and-select body below is shared by all three
// fence triggers: `replace` and `insertAfter` + `remove` were pinned
// net-identical for this rewrite (same position, paragraph children dropped
// either way, same NodeSelection), so one body serves every trigger.
//
// The divider regex is single-sourced — both HR triggers already tested the
// paragraph's full text against the byte-identical expression. The HR
// replace bodies stay TWO named per-trigger variants because the step-1 pins
// showed observable divergence: at the document end the markdown trigger
// KEEPS the emptied paragraph after the rule, while the per-update scan
// creates a FRESH paragraph (different node identity, pinned in
// test/unit/plugins/HorizontalRulePlugin.test.tsx), and only the markdown
// trigger has a phase branch (import replaces the paragraph outright — the
// paragraph is container text, not the writer's caret paragraph). Converging
// them would move a pinned behavior, so each variant names its trigger. (The
// fresh-key side is key-pinned in
// test/unit/plugins/HorizontalRulePlugin.test.tsx; the kept-paragraph side is
// covered by the import pin and typing e2e, not by key.)
//
// The card classes are resolved through the editor's registered-node map at
// call time (`$registeredCardClass`), not imported from the card shims: this
// module is reachable from the card-free core path (keyboard navigation is
// mounted by every InklingComposableEditor), and the shims drag in the
// decorate tree. An editor that doesn't register the card simply gets no
// shortcut — `$fireFenceKeyboardShortcut` returns false, the `$insert*`
// bodies no-op.

import {
  $createParagraphNode,
  $getEditor,
  $getSelection,
  $isTextNode,
  type ElementNode,
  type Klass,
  type LexicalNode,
} from 'lexical'

import { FENCE_KEYBOARD_REGEXP } from '@/markdown/grammar'
import { $selectDecoratorNode } from '@/utils'
import { getRegisteredNodeMap } from '@/utils/lexical-internals'

/**
 * The registered class for a card node type, looked up on the active editor
 * at call time. The shims' `$create*Node` factories statically import the
 * assembled card classes, which would drag the whole decorate tree into this
 * module — and this module sits on the core path via the keyboard-navigation
 * seam. The editor's registered-node map is the cycle-free source of the
 * same class (the registered class IS the assembled one). `undefined` when
 * the editor doesn't register the card — every caller treats that as
 * "shortcut unavailable".
 */
function $registeredCardClass(nodeType: string): Klass<LexicalNode> | undefined {
  return getRegisteredNodeMap($getEditor()).get(nodeType)?.klass
}

/**
 * The one code-fence serialization: opening fence with language, body,
 * closing fence. The two export transformers (the typing/import `CODE_BLOCK`
 * in `@/markdown/transformers` and the round-trip dialect's `CODE_FENCE`)
 * differ only in their TEXT SOURCE — `getTextContent()` vs `node.code` — and
 * both delegate here, so the fence shape can never fork again.
 */
export function codeBlockFence(language: string, text: string): string {
  return '```' + language + (text ? '\n' + text : '') + '\n' + '```'
}

/**
 * The one bracketing-fence strip for multiline-element import: `linesInBetween`
 * includes the (always empty) remainder of the opening fence line and the
 * (always empty) prefix of the closing fence line — drop both.
 */
export function stripFenceLines(linesInBetween: string[] | null | undefined): string {
  return linesInBetween?.slice(1, -1).join('\n') ?? ''
}

/** enter/tab trigger: fires on the key regardless of trailing space. NOT
 * end-anchored, so the `(\w{1,10})` group does not cap the language length
 * on this trigger (see module comment). The regex itself is single-sourced
 * in the shared grammar table (`@/markdown/grammar`). */

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

  // select node when replacing so it immediately renders in editing mode
  // (keyboard-triggered: the caller already owns focus — the 'never' leg)
  $selectDecoratorNode(replacementNode)
  return true
}

/**
 * enter/tab keyboard trigger body: the caret text starts with a fence
 * (FENCE_KEYBOARD_REGEXP), so swap its paragraph for a code block card. Owns
 * the keyboard trigger's language extraction — the FULL rest of the line
 * (`replace(/^```/, '')`, 'js extra' and all) — where the transformer trigger
 * keeps its `match[1]` capture. Returns true when the shortcut fired (event
 * consumed); false when the caret isn't on a fence line or the code card
 * isn't registered, so the caller falls through to its other key handling.
 */
export function $fireFenceKeyboardShortcut(event: KeyboardEvent): boolean {
  const selection = $getSelection()
  const currentNode = selection?.getNodes()[0]
  if (!$isTextNode(currentNode)) {
    return false
  }
  const textContent = currentNode.getTextContent()
  if (!textContent.match(FENCE_KEYBOARD_REGEXP)) {
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

/** divider trigger, single-sourced: both the markdown transformer and the
 * HorizontalRulePlugin per-update scan test the paragraph's full text
 * against this expression. */
export const DIVIDER_REGEXP = /^(---|\*\*\*|___)\s?$/

/**
 * The phase a markdown transformer `replace` runs in, named at the seam
 * instead of threading `@lexical/markdown`'s `isImport` boolean through:
 * 'import' during `$convertFromMarkdownString`, 'typing' on a live shortcut
 * keystroke. Only the HR markdown trigger branches on it — the code fence
 * and the card transformers behave identically in either phase.
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
