// The card-bearing transformer sets: HR and CODE_BLOCK construct card nodes
// (their trigger bodies live in `@/markdown/card-shortcuts`), so this module
// statically imports the card shims and is excluded from the `./core` entry.
// The card-free sets (SUBSCRIPT/SUPERSCRIPT/MINIMAL/BASIC) live in
// `@/markdown/transformers-core`.

import type { ElementNode, LexicalNode } from 'lexical'

import {
  HEADING,
  ORDERED_LIST,
  QUOTE,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
  UNORDERED_LIST,
  type Transformer,
} from '@lexical/markdown'

import {
  $insertCodeBlockForShortcut,
  $insertHorizontalRuleForMarkdownTrigger,
  codeBlockFence,
  DIVIDER_REGEXP,
} from '@/markdown/card-shortcuts'
import { FENCE_TRANSFORMER_REGEXP } from '@/markdown/grammar'
import { CUSTOM_TEXT_FORMAT_TRANSFORMERS } from '@/markdown/transformers-core'
import { $isCodeBlockNode, CodeBlockNode } from '@/nodes/CodeBlockNode'
import { $isHorizontalRuleNode, HorizontalRuleNode } from '@/nodes/HorizontalRuleNode'

export const HR = {
  dependencies: [HorizontalRuleNode],
  export: (node: LexicalNode) => {
    return $isHorizontalRuleNode(node) ? '---' : null
  },
  // trigger only: the regex and replace-and-select live in the card-shortcut
  // seam (@/markdown/card-shortcuts)
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
    // the fence shape is single-sourced in the card-shortcut seam; this
    // transformer's variance is the text source (getTextContent)
    return codeBlockFence(node.language, node.getTextContent())
  },
  // trigger only: the regex lives in the shared grammar table
  // (`@/markdown/grammar`), and the trailing `\s` there is what makes the
  // fence fire on the space keystroke
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
