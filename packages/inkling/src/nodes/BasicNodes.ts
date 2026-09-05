import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'

// Deep import (not the `@/nodes/base` barrel) — see MinimalNodes.ts.
import { TKNode } from '@/nodes/base/nodes/TKNode'

const BASIC_NODES = [ListNode, ListItemNode, LinkNode, TKNode]

export default BASIC_NODES
