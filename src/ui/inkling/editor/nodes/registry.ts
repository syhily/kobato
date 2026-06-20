import type { InitialConfigType } from '@lexical/react/LexicalComposer'

import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { ParagraphNode } from 'lexical'

import { InlineMathNode } from '@/ui/inkling/editor/article/InlineMathNode'
import { SolutionCardNode, TwoColumnCardNode } from '@/ui/inkling/editor/cards/layout-card-nodes'
import {
  CodeCardNode,
  HorizontalRuleCardNode,
  ImageCardNode,
  MathCardNode,
  MusicCardNode,
  TableCardNode,
} from '@/ui/inkling/editor/cards/simple-card-nodes'
import { CodeBlockNode } from '@/ui/inkling/editor/comment/nodes/CodeBlockNode'
import { InlineMathNode as CommentInlineMathNode } from '@/ui/inkling/editor/comment/nodes/InlineMathNode'
import { MathBlockNode } from '@/ui/inkling/editor/comment/nodes/MathBlockNode'
import { FootnoteRefNode } from '@/ui/inkling/editor/footnotes/FootnoteRefNode'

/**
 * Node registry for the three Inkling editor modes.
 *
 * This is the single source of truth — the article editor
 * (`InklingArticleEditor`), the comment editor (`CommentEditor`), and the
 * nested editor (`NestedEditor`) all derive their node arrays from here.
 * Previously each entry point hand-maintained its own array, plus a fourth
 * list in the test helper (`tests/_helpers/headless-editor.ts`); those could
 * silently drift.
 *
 * Note: `FootnoteDefinitionNode` is intentionally NOT in any set. The article
 * editor uses a parallel-state footnote model — definitions live in
 * `InklingFootnoteProvider`, not in the Lexical tree. The class exists only
 * as a paste/import fallback and is never mounted.
 */

/** Prose nodes shared by every editor mode. */
const PROSE_NODES: InitialConfigType['nodes'] = [ParagraphNode, QuoteNode, ListNode, ListItemNode, LinkNode]

/**
 * Article editor node set. Full feature set: prose + headings + inline math
 * (article variant) + all block cards + layout cards + footnote refs.
 */
export const ARTICLE_NODES: InitialConfigType['nodes'] = [
  ...PROSE_NODES,
  HeadingNode,
  FootnoteRefNode,
  InlineMathNode,
  ImageCardNode,
  CodeCardNode,
  MathCardNode,
  MusicCardNode,
  HorizontalRuleCardNode,
  TableCardNode,
  SolutionCardNode,
  TwoColumnCardNode,
]

/**
 * Comment editor node set. Restricted: no headings, no cards, no footnotes.
 * Uses the comment-specific DOM-rendered code/math nodes (not the decorated
 * article variants) so comment editing stays lightweight.
 */
export const COMMENT_NODES: InitialConfigType['nodes'] = [
  ...PROSE_NODES,
  CodeBlockNode,
  MathBlockNode,
  CommentInlineMathNode,
]

/**
 * Nested editor node set (inside Solution / TwoColumn / FootnoteDialog).
 * Same as article minus the recursive containers (no Solution, TwoColumn,
 * or FootnoteRef — prevents infinite nesting). Music is excluded because
 * the nested editor is for prose, not media layout.
 */
export const NESTED_ARTICLE_NODES: InitialConfigType['nodes'] = [
  ...PROSE_NODES,
  HeadingNode,
  InlineMathNode,
  ImageCardNode,
  CodeCardNode,
  MathCardNode,
  HorizontalRuleCardNode,
  TableCardNode,
]
