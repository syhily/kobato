// Deep import (not the `@kobato/inkling-internal/nodes/base` barrel) — see MinimalNodes.ts.
import { TKNode } from '@kobato/inkling-internal/nodes/base/nodes/TKNode'
import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'

const BASIC_NODES = [ListNode, ListItemNode, LinkNode, TKNode]

export default BASIC_NODES
