import type { CreateEditorArgs } from 'lexical'

import { InlineMathNode } from '@kobato/editor/lexical-core/nodes/inline-math-node'
import { MathBlockNode } from '@kobato/editor/lexical-core/nodes/math-block-node'
import { CodeNode } from '@lexical/code'
import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { QuoteNode } from '@lexical/rich-text'
import { LineBreakNode, ParagraphNode, TextNode } from 'lexical'

export const COMMENT_EDITOR_NAMESPACE = 'kobato-comment'

/**
 * The node registry for the comment editor: the strict subset of
 * `createBodyEditorConfig` that the comment dialect allows (see
 * `@kobato/shared/lexical/comment-schema`). The headless
 * validator/canonicalizer (`lexical-core/comment-validate.ts`) and the
 * React comment editor both build their config from here.
 *
 * Deliberately NOT registered (the body registry's extras): HeadingNode,
 * HorizontalRuleNode, the table family, ImageNode, MusicPlayerNode,
 * SolutionNode / TwoColumnNode / TwoColumnPaneNode, FootnoteRefNode and
 * FootnoteDefinitionNode — comments carry none of them. An unregistered
 * node type is dropped by `parseEditorState` (0.45 behavior), so the
 * zod gate is the primary rejector and the parse gate is the second
 * line of defense — the same double-gate as the body track.
 */
export function createCommentEditorConfig(): CreateEditorArgs {
  return {
    namespace: COMMENT_EDITOR_NAMESPACE,
    nodes: [
      // Standard rich-text blocks the comment dialect allows.
      ParagraphNode,
      TextNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      LinkNode,
      CodeNode,
      LineBreakNode,
      // Custom comment dialect (inline + display math only).
      InlineMathNode,
      MathBlockNode,
    ],
  }
}
