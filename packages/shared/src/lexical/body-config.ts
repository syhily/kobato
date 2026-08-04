import type { CreateEditorArgs } from 'lexical'

import { FootnoteDefinitionNode } from '@kobato/shared/lexical/nodes/footnote-definition-node'
import { FootnoteRefNode } from '@kobato/shared/lexical/nodes/footnote-ref-node'
import { HorizontalRuleNode } from '@kobato/shared/lexical/nodes/horizontal-rule-node'
import { ImageNode } from '@kobato/shared/lexical/nodes/image-node'
import { InlineMathNode } from '@kobato/shared/lexical/nodes/inline-math-node'
import { MathBlockNode } from '@kobato/shared/lexical/nodes/math-block-node'
import { MusicPlayerNode } from '@kobato/shared/lexical/nodes/music-player-node'
import { SolutionNode } from '@kobato/shared/lexical/nodes/solution-node'
import { TwoColumnNode, TwoColumnPaneNode } from '@kobato/shared/lexical/nodes/two-column-node'
import { CodeNode } from '@lexical/code'
import { AutoLinkNode, LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table'
import { LineBreakNode, ParagraphNode, TextNode } from 'lexical'

export const BODY_EDITOR_NAMESPACE = 'kobato-body'

/**
 * The single node-registry source for the body editor: the headless
 * canonicalizer/validator (`./validate.ts`) and the
 * React editor (`<LexicalComposer initialConfig={createBodyEditorConfig()} />`)
 * both build their config from here, so a node added to the registry is
 * guaranteed to round-trip through `parseEditorState` → `toJSON`.
 *
 * Standard nodes come from the 0.45.0 packages; the custom dialect
 * (inline math, footnote refs, images, block math, music players,
 * horizontal rules, solution / twoColumn / footnoteDefinition
 * containers) lives in `./nodes/*` — see `@kobato/shared/lexical/schema`
 * for the matching JSON dialect.
 */
export function createBodyEditorConfig(): CreateEditorArgs {
  return {
    namespace: BODY_EDITOR_NAMESPACE,
    nodes: [
      // Standard rich-text blocks.
      ParagraphNode,
      TextNode,
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      LinkNode,
      AutoLinkNode,
      CodeNode,
      LineBreakNode,
      HorizontalRuleNode,
      // Tables.
      TableNode,
      TableRowNode,
      TableCellNode,
      // Custom body dialect.
      InlineMathNode,
      FootnoteRefNode,
      ImageNode,
      MathBlockNode,
      MusicPlayerNode,
      SolutionNode,
      TwoColumnNode,
      TwoColumnPaneNode,
      FootnoteDefinitionNode,
    ],
  }
}
