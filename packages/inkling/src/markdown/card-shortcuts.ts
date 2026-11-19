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
