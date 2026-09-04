// The page/article editor's composer node set (plan
// docs/plans/inkling-editor-replacement.md, R11/M3): EDITOR_BASE_NODES minus
// AsideNode, the whitelisted card classes, the two inline/entity tails, and
// the three kobato host cards. Every mounted type must stay inside
// FULL_EDITOR_NODE_TYPES (`@/shared/lexical/node-whitelist`) — the editor
// must never produce a node the storage schema rejects; the contract test
// (tests/unit/shared/contracts/lexical-node-whitelist.test.ts) pins this
// list's types against the whitelist and `ARTICLE_COMPOSER_NODE_TYPES`.
//
// `image` registers KobatoImageNode — NEVER alongside the stock assembled
// ImageNode (Lexical keys registrations by type). The stock class is
// deliberately absent: every type-gated stock behaviour (slash menu, upload
// claiming, drag/drop paste routing) reads the registered-type set, while
// the two handlers that would construct the STOCK class (INSERT_IMAGE_COMMAND
// in CardInsertPlugin, OPEN_IMAGE_LIBRARY_COMMAND in InklingSelectorPlugin —
// both mount anyway because hasNodes is type-gated) are intercepted by
// `@/client/editor/image-insert-override` at HIGH priority.

import {
  CodeBlockNode,
  EDITOR_BASE_NODES,
  FootnoteDefinitionNode,
  FootnoteRefNode,
  HorizontalRuleNode,
  MathInlineNode,
  MathNode,
} from '@inkling/editor'

import { musicPlayerCard } from '@/client/editor/cards/music-player'
import { solutionCard } from '@/client/editor/cards/solution'
import { twoColumnCard } from '@/client/editor/cards/two-column'
import { KobatoImageNode } from '@/client/editor/kobato-image-node'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// AsideNode is filtered out: 'aside' is not in FULL_EDITOR_NODE_TYPES, and
// inkling's Ctrl+Q quote→aside→paragraph cycle would construct one (the
// chord is captured host-side before inkling sees it — PageBodyEditor).
// Node-replacement pair entries carry no static getType, so the filter
// tolerates non-class members.
const EDITOR_BASE_WITHOUT_ASIDE = EDITOR_BASE_NODES.filter((entry) => {
  const klass = unsafeCast<{ getType?: () => string }>(entry)
  return typeof klass.getType !== 'function' || klass.getType() !== 'aside'
})

export const PAGE_EDITOR_NODES = [
  ...EDITOR_BASE_WITHOUT_ASIDE,
  KobatoImageNode,
  CodeBlockNode,
  MathNode,
  HorizontalRuleNode,
  FootnoteDefinitionNode,
  MathInlineNode,
  FootnoteRefNode,
  solutionCard.node,
  twoColumnCard.node,
  musicPlayerCard.node,
]
