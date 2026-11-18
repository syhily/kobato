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

// Cards join the set from their declarations.
const CARDS = CARD_WRAPPER_NODES

// The non-card base run the editor's node set starts from. The table
// element family closes the run, after LinkNode.
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
  // AutoLinkNode powers the default autolink plugin (typed URLs become
  // links); it extends LinkNode without replacing it — imported `<a>` markup
  // still lands as plain LinkNode.
  AutoLinkNode,
  ...INKLING_TABLE_NODES,
]

// Every card class is assembled via `assembleCardNode`, which runs this same
// own-method pass at assembly time; only AsideNode needs it here.
ensureLexicalNodeOwnMethods(AsideNode)

const DEFAULT_NODES = [...EDITOR_BASE_NODES, ...CARDS.map((card) => card.node), ...ENTITY_TAIL_NODES]
export default DEFAULT_NODES
