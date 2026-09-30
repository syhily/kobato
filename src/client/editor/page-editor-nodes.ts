// The page/article editor's composer node set (plan
// docs/plans/inkling-editor-replacement.md, R11/M3): EDITOR_BASE_NODES minus
// AsideNode, the whitelisted card classes, the two inline/entity tails, and
// the kobato host cards — composed through the registry projection
// (`getHostCardNodes`) instead of hand-spread handles; the side-effect
// imports below are what run the cards' top-level `defineCard`
// registrations (registration order here = projection order). Every mounted
// type must stay inside FULL_EDITOR_NODE_TYPES (`@/shared/lexical/node-whitelist`)
// — the editor must never produce a node the storage schema rejects; the
// contract test (tests/unit/shared/contracts/lexical-node-whitelist.test.ts)
// pins this list's types against the whitelist and
// `ARTICLE_COMPOSER_NODE_TYPES`.
//
// `image` registers KobatoImageNode — NEVER alongside the stock assembled
// ImageNode (Lexical keys registrations by type). The stock class is
// deliberately absent: every type-gated stock behaviour (slash menu, upload
// claiming, drag/drop paste routing) reads the registered-type set, while
// the two handlers that would construct the STOCK class (INSERT_IMAGE_COMMAND
// in CardInsertPlugin, OPEN_IMAGE_LIBRARY_COMMAND in InklingSelectorPlugin —
// both mount anyway because hasNodes is type-gated) are intercepted by
// `@/client/editor/image-insert-override` at HIGH priority.

import '@/client/editor/cards/music-player'
import '@/client/editor/cards/solution'
import '@/client/editor/cards/two-column'
// Registers the 'image' picker override (the pick seam's variant channel) —
// KobatoImageNode below is a stock-variant, not a defineCard card, so its
// library picker registers beside the node-set composition.
import '@/client/editor/image-library-pick'
import { excludeBaseNodes } from '@/client/editor/base-node-filter'
import { KobatoImageNode } from '@/client/editor/kobato-image-node'
import {
  CodeBlockNode,
  EDITOR_BASE_NODES,
  FootnoteDefinitionNode,
  FootnoteRefNode,
  getHostCardNodes,
  HorizontalRuleNode,
  MathInlineNode,
  MathNode,
} from '@/inkling'

// AsideNode is filtered out: 'aside' is not in FULL_EDITOR_NODE_TYPES, and
// inkling's Ctrl+Q quote→aside→paragraph cycle would construct one (the
// chord is captured host-side before inkling sees it —
// `@/client/editor/block-quote-aside-cycle`).
const EDITOR_BASE_WITHOUT_ASIDE = excludeBaseNodes(EDITOR_BASE_NODES, new Set(['aside']))

export const PAGE_EDITOR_NODES = [
  ...EDITOR_BASE_WITHOUT_ASIDE,
  KobatoImageNode,
  CodeBlockNode,
  MathNode,
  HorizontalRuleNode,
  FootnoteDefinitionNode,
  MathInlineNode,
  FootnoteRefNode,
  ...getHostCardNodes(),
]
