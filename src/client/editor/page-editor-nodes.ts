// The page/article composer node set, composed through the host-card registry
// projection (`getHostCardNodes`); the side-effect imports below run each card's
// top-level `defineCard`, so registration order here is projection order. Every
// mounted type must stay inside FULL_EDITOR_NODE_TYPES
// (`@/shared/lexical/node-whitelist`) — the editor must never produce a node the
// storage schema rejects; the contract test
// (tests/unit/shared/contracts/lexical-node-whitelist.test.ts) pins the list
// against the whitelist and ARTICLE_COMPOSER_NODE_TYPES.
//
// `image` registers KobatoImageNode — NEVER alongside the stock assembled
// ImageNode (Lexical keys registrations by type). The stock class is
// deliberately absent: every type-gated stock behaviour (slash menu, upload
// claiming, drag/drop paste routing) reads the registered-type set, while the
// two handlers that would construct the STOCK class (INSERT_IMAGE_COMMAND
// in CardInsertPlugin, OPEN_IMAGE_LIBRARY_COMMAND in InklingSelectorPlugin —
// both mount anyway because hasNodes is type-gated) are intercepted by
// `@/client/editor/image-insert-override` at HIGH priority.

import '@/client/editor/cards/music-player'
import '@/client/editor/cards/solution'
import '@/client/editor/cards/two-column'
// Registers the 'image' picker override through the pick seam's variant channel;
// KobatoImageNode is a stock variant rather than a `defineCard` card, so its
// picker registers beside the node-set composition.
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

// 'aside' is not in FULL_EDITOR_NODE_TYPES, and inkling's Ctrl+Q cycle would
// construct one; the chord is swallowed host-side (`block-quote-aside-cycle`).
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
