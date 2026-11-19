import { EXTENDED_TEXT_NODE_PAIR } from '@kobato/inkling-internal/nodes/base/nodes/extended-node-pairs'
import { TKNode } from '@kobato/inkling-internal/nodes/base/nodes/TKNode'
import { LinkNode } from '@lexical/link'

const MINIMAL_NODES = [...EXTENDED_TEXT_NODE_PAIR, LinkNode, TKNode]

export default MINIMAL_NODES
