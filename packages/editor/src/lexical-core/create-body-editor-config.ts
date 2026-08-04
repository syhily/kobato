import type { CreateEditorArgs } from 'lexical'

import { FootnoteDefinitionNode } from '@kobato/editor/lexical-core/nodes/footnote-definition-node'
import { FootnoteRefNode } from '@kobato/editor/lexical-core/nodes/footnote-ref-node'
import { HorizontalRuleNode } from '@kobato/editor/lexical-core/nodes/horizontal-rule-node'
import { ImageNode } from '@kobato/editor/lexical-core/nodes/image-node'
import { InlineMathNode } from '@kobato/editor/lexical-core/nodes/inline-math-node'
import { MathBlockNode } from '@kobato/editor/lexical-core/nodes/math-block-node'
import { MusicPlayerNode } from '@kobato/editor/lexical-core/nodes/music-player-node'
import { SolutionNode } from '@kobato/editor/lexical-core/nodes/solution-node'
import { TwoColumnNode, TwoColumnPaneNode } from '@kobato/editor/lexical-core/nodes/two-column-node'
import { CodeNode } from '@lexical/code'
import { AutoLinkNode, LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table'
import { LineBreakNode, ParagraphNode, TextNode } from 'lexical'

export const BODY_EDITOR_NAMESPACE = 'kobato-body'

/**
 * The single node-registry source for the body editor: the headless
 * canonicalizer/validator (`lexical-core/validate.ts`) and the future
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
