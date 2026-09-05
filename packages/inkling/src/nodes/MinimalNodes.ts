import { LinkNode } from '@lexical/link'

// Deep imports (not the `@/nodes/base` barrel): the barrel derives its node
// set from the card declarations, and declarations reference MINIMAL_NODES in
// their `nestedEditors` specs — importing the barrel here would close a cycle.
// The extended-text pair comes from its own cycle-free leaf.
import { EXTENDED_TEXT_NODE_PAIR } from '@/nodes/base/nodes/extended-node-pairs'
import { TKNode } from '@/nodes/base/nodes/TKNode'

const MINIMAL_NODES = [...EXTENDED_TEXT_NODE_PAIR, LinkNode, TKNode]

export default MINIMAL_NODES
