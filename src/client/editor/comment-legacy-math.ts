// Legacy comment bodies may still carry the retired math card pair (the R12
// comment surface mounted MathNode / MathInlineNode): the composer no longer
// registers those classes, so a stored `math` / `math-inline` node would
// abort `parseEditorState` at seed time (Lexical error #17) and the comment
// would fail to open for editing. The downgrade maps the pair onto the fence
// dialect ahead of parsing — `math` becomes a ```math codeblock (tex → code),
// `math-inline` becomes `$tex$` plain text — so the seed parses through the
// trimmed node set and the next save persists the fence form. Pure state →
// state; the input is never mutated.

import type { CommentEditorState } from '@/shared/lexical/comment-schema'
import type { LexicalNodeJson } from '@/shared/lexical/schema'

import { visitLexicalNodes } from '@/shared/lexical/walk'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

type MutableNode = Record<string, unknown> & { type: string; children?: LexicalNodeJson[] }

export function downgradeLegacyCommentMath(state: CommentEditorState): CommentEditorState {
  let hasMath = false
  visitLexicalNodes(state, (node) => {
    if (node.type === 'math' || node.type === 'math-inline') {
      hasMath = true
    }
  })
  if (!hasMath) {
    return state
  }
  const copy = structuredClone(state)
  rewriteChildren(unsafeCast<MutableNode>(copy.root))
  return copy
}

function rewriteChildren(node: MutableNode): void {
  if (node.children === undefined) {
    return
  }
  node.children = node.children.map((child) => {
    const mutable = unsafeCast<MutableNode>(child)
    const downgraded = downgradeNode(mutable)
    rewriteChildren(downgraded)
    return unsafeCast<LexicalNodeJson>(downgraded)
  })
}

function downgradeNode(node: MutableNode): MutableNode {
  if (node.type === 'math') {
    return {
      type: 'codeblock',
      version: 1,
      code: typeof node.tex === 'string' ? node.tex : '',
      language: 'math',
      caption: '',
      highlightedHtml: '',
    }
  }
  if (node.type === 'math-inline') {
    const tex = typeof node.tex === 'string' ? node.tex : ''
    return {
      type: 'extended-text',
      version: 1,
      detail: 0,
      format: 0,
      mode: 'normal',
      style: '',
      text: `$${tex}$`,
    }
  }
  return node
}
