import type { ElementNode, LexicalNode } from 'lexical'

import {
  $insertCodeBlockForShortcut,
  $insertHorizontalRuleForMarkdownTrigger,
  codeBlockFence,
  DIVIDER_REGEXP,
} from '@kobato/inkling-internal/markdown/card-shortcuts'
import { FENCE_TRANSFORMER_REGEXP } from '@kobato/inkling-internal/markdown/grammar'
import { CUSTOM_TEXT_FORMAT_TRANSFORMERS } from '@kobato/inkling-internal/markdown/transformers-core'
import { $isCodeBlockNode, CodeBlockNode } from '@kobato/inkling-internal/nodes/CodeBlockNode'
import { $isHorizontalRuleNode, HorizontalRuleNode } from '@kobato/inkling-internal/nodes/HorizontalRuleNode'
import {
  HEADING,
  ORDERED_LIST,
  QUOTE,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
  UNORDERED_LIST,
  type Transformer,
} from '@lexical/markdown'

export const HR = {
  dependencies: [HorizontalRuleNode],
  export: (node: LexicalNode) => {
    return $isHorizontalRuleNode(node) ? '---' : null
  },

  regExp: DIVIDER_REGEXP,
  replace: (parentNode: ElementNode, _children: LexicalNode[], _match: string[], isImport: boolean) => {
    $insertHorizontalRuleForMarkdownTrigger(parentNode, isImport ? 'import' : 'typing')
  },
  type: 'element' as const,
}

export const CODE_BLOCK = {
  dependencies: [CodeBlockNode],
  export: (node: LexicalNode) => {
    if (!$isCodeBlockNode(node)) {
      return null
    }
    return codeBlockFence(node.language, node.getTextContent())
  },

  regExp: FENCE_TRANSFORMER_REGEXP,
  replace: (parentNode: ElementNode, _children: LexicalNode[], match: string[]) => {
    $insertCodeBlockForShortcut(parentNode, match[1])
  },
  type: 'element' as const,
}

export const ELEMENT_TRANSFORMERS: Transformer[] = [HEADING, QUOTE, UNORDERED_LIST, ORDERED_LIST, HR, CODE_BLOCK]
export const DEFAULT_TRANSFORMERS: Transformer[] = [
  ...ELEMENT_TRANSFORMERS,
  ...TEXT_FORMAT_TRANSFORMERS,
  ...CUSTOM_TEXT_FORMAT_TRANSFORMERS,
  ...TEXT_MATCH_TRANSFORMERS,
]
