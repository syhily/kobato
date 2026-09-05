import { ExtendedHeadingNode, extendedHeadingNodeReplacement } from '@/nodes/base/nodes/ExtendedHeadingNode'
import { ExtendedQuoteNode, extendedQuoteNodeReplacement } from '@/nodes/base/nodes/ExtendedQuoteNode'
import { ExtendedTextNode, extendedTextNodeReplacement } from '@/nodes/base/nodes/ExtendedTextNode'

// The named extended-node runs — the one home of "an extended node and its
// replacement config travel as one pair". Kept in a leaf module (not the
// nodes/base barrel, which derives its node set from the card declarations)
// so MINIMAL_NODES can compose a pair without closing the import cycle:
// declarations reference MINIMAL_NODES in their nestedEditors specs, and the
// barrel derives its node set from those declarations.
export const EXTENDED_TEXT_NODE_PAIR = [ExtendedTextNode, extendedTextNodeReplacement]
export const EXTENDED_HEADING_NODE_PAIR = [ExtendedHeadingNode, extendedHeadingNodeReplacement]
export const EXTENDED_QUOTE_NODE_PAIR = [ExtendedQuoteNode, extendedQuoteNodeReplacement]
