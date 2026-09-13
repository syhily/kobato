// The card-bearing transformer sets: HR and CODE_BLOCK construct card nodes
// (their trigger bodies live in `@/inkling/markdown/card-shortcuts`), so this module
// statically imports the card shims. The card-free sets
// (SUBSCRIPT/SUPERSCRIPT/MINIMAL/BASIC) live in
// `@/inkling/markdown/transformers-core` so card-free compositions take
// markdown shortcuts without pulling the card shims — `MarkdownShortcutPlugin`
// defaults to the card-free `MINIMAL_TRANSFORMERS` (what `InklingComposerBase`
// compositions get), while `InklingEditor` passes this module's
// `DEFAULT_TRANSFORMERS` explicitly.

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
} from '@/inkling/markdown/card-shortcuts'
import { FENCE_TRANSFORMER_REGEXP } from '@/inkling/markdown/grammar'
import { CUSTOM_TEXT_FORMAT_TRANSFORMERS } from '@/inkling/markdown/transformers-core'
import { $isCodeBlockNode, CodeBlockNode } from '@/inkling/nodes/CodeBlockNode'
import { $isHorizontalRuleNode, HorizontalRuleNode } from '@/inkling/nodes/HorizontalRuleNode'

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
  // (`@/inkling/markdown/grammar`), and the trailing `\s` there is what makes the
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
