// The comment editor's markdown shortcut set (R12): inkling's
// DEFAULT_TRANSFORMERS filtered down to the transformers whose node classes
// the comment composer actually registers, plus a kobato-owned `$…$` inline
// math trigger. Deriving from the registered classes (instead of naming
// transformers) keeps this list in lockstep with `COMMENT_EDITOR_NODES`:
// dropping a node class automatically drops its markdown trigger.
//
// The filter yields QUOTE / UNORDERED_LIST / ORDERED_LIST (list + quote
// classes registered), CODE_BLOCK (the ``` fence — CodeBlockNode is
// registered), the text-format and custom text-format runs (no node
// dependencies), and the LINK text-match transformer (LinkNode registered).
// HEADING and HR fall out because HeadingNode and HorizontalRuleNode are not
// mounted.

import type { Transformer } from '@inkling/editor'

import { $createMathInlineNode, $isMathInlineNode, DEFAULT_TRANSFORMERS, MathInlineNode } from '@inkling/editor'

import { COMMENT_EDITOR_NODES } from '@/client/editor/comment-editor-nodes'

const REGISTERED_NODE_CLASSES = new Set<unknown>(COMMENT_EDITOR_NODES.filter((entry) => typeof entry === 'function'))

const registeredOnly = DEFAULT_TRANSFORMERS.filter(
  (transformer) =>
    !('dependencies' in transformer) || transformer.dependencies.every((klass) => REGISTERED_NODE_CLASSES.has(klass)),
)

type TextMatchTransformer = Extract<Transformer, { type: 'text-match' }>

// `$…$` inline math — the comment surface mounts MathInlineNode but no
// MathInlinePlugin editing UI (parity with the retired tiptap comment
// editor: an inline formula is deleted and retyped, never edited in place).
// The closing-`$` trigger mirrors the old tiptap input rule
// `/([^\\$]|^)\$(?!\$)([^$\n]+)\$(?!\$)$/`: a backslash-escaped or `$$`
// opening never fires. kobato cannot import `lexical` (the package is not
// hoisted to the workspace root), so the replace path works through node
// instance methods only: the plugin hands over a TextNode holding exactly
// match[0], which includes the single look-behind character — keep it as the
// node's text and hang the math node after it.
const INLINE_MATH: TextMatchTransformer = {
  dependencies: [MathInlineNode],
  export: (node) => {
    return $isMathInlineNode(node) && node.tex ? `$${node.tex}$` : null
  },
  regExp: /([^\\$]|^)\$(?!\$)([^$\n]+)\$(?!\$)$/,
  replace: (textNode, match) => {
    const [, prefix, rawTex] = match
    const tex = rawTex?.trim()
    if (!tex) {
      return
    }
    const mathNode = $createMathInlineNode({ tex })
    if (prefix) {
      textNode.setTextContent(prefix)
      textNode.insertAfter(mathNode)
    } else {
      textNode.replace(mathNode)
    }
  },
  trigger: '$',
  type: 'text-match',
}

export const COMMENT_MARKDOWN_TRANSFORMERS: Transformer[] = [...registeredOnly, INLINE_MATH]
