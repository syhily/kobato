import { AsideNode } from '@kobato/inkling-internal/nodes/AsideNode'
import {
  ENTITY_TAIL_NODES,
  EXTENDED_HEADING_NODE_PAIR,
  EXTENDED_QUOTE_NODE_PAIR,
  EXTENDED_TEXT_NODE_PAIR,
  ensureLexicalNodeOwnMethods,
} from '@kobato/inkling-internal/nodes/base'
import { CARD_WRAPPER_NODES } from '@kobato/inkling-internal/nodes/cards/card-wrappers'
import { INKLING_TABLE_NODES } from '@kobato/inkling-internal/nodes/table/TableNodes'
import { AutoLinkNode, LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'

const CARDS = CARD_WRAPPER_NODES

export const EDITOR_BASE_NODES = [
  ...EXTENDED_TEXT_NODE_PAIR,
  HeadingNode,
  ...EXTENDED_HEADING_NODE_PAIR,
  QuoteNode,
  ...EXTENDED_QUOTE_NODE_PAIR,
  ListNode,
  ListItemNode,
  AsideNode,
  LinkNode,
  AutoLinkNode,
  ...INKLING_TABLE_NODES,
]

ensureLexicalNodeOwnMethods(AsideNode)

const DEFAULT_NODES = [...EDITOR_BASE_NODES, ...CARDS.map((card) => card.node), ...ENTITY_TAIL_NODES]
export default DEFAULT_NODES
