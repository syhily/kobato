import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'

// Deep import (not the `@/inkling/nodes/base` barrel) — see MinimalNodes.ts.
import { TKNode } from './base/nodes/TKNode'

const BASIC_NODES = [ListNode, ListItemNode, LinkNode, TKNode]

export default BASIC_NODES
