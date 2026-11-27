import '@kobato/web-admin/ui/editor/music-card-picker'
import '@kobato/web-admin/ui/editor/image-library-pick'
import {
  CodeBlockNode,
  EDITOR_BASE_NODES,
  FootnoteDefinitionNode,
  FootnoteRefNode,
  excludeBaseNodes,
  getHostCardNodes,
  HorizontalRuleNode,
  MathInlineNode,
  MathNode,
} from '@kobato/inkling'
import { KobatoImageNode } from '@kobato/inkling/host-cards'

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
