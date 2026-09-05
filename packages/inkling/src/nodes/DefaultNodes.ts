import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'

import { AsideNode } from '@/nodes/AsideNode'
import {
  ENTITY_TAIL_NODES,
  EXTENDED_HEADING_NODE_PAIR,
  EXTENDED_QUOTE_NODE_PAIR,
  EXTENDED_TEXT_NODE_PAIR,
  ensureLexicalNodeOwnMethods,
} from '@/nodes/base'
import { CARD_WRAPPER_NODES } from '@/nodes/cards/card-wrappers'
import { INKLING_TABLE_NODES } from '@/nodes/table/TableNodes'

// Cards join the set from their declarations; declaration order reproduces
// the pre-refactor card run below LinkNode.
const CARDS = CARD_WRAPPER_NODES

// The non-card base run the editor's node set starts from. The table
// element family (CONTEXT.md — not cards) closes the run, after LinkNode.
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
  ...INKLING_TABLE_NODES,
]

// Every card class is assembled via `assembleCardNode`, which runs this same
// own-method pass at assembly time; only AsideNode needs it here.
ensureLexicalNodeOwnMethods(AsideNode)

const DEFAULT_NODES = [...EDITOR_BASE_NODES, ...CARDS.map((card) => card.node), ...ENTITY_TAIL_NODES]
export default DEFAULT_NODES
