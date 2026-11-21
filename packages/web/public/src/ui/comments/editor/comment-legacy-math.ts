import type { CommentEditorState } from '@kobato/inkling/headless/comment-schema'
import type { LexicalNodeJson } from '@kobato/inkling/headless/schema'

import { visitLexicalNodes } from '@kobato/inkling/headless/walk'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

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
