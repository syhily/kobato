import {
  ExtendedHeadingNode,
  extendedHeadingNodeReplacement,
} from '@kobato/inkling-internal/nodes/base/nodes/ExtendedHeadingNode'
import {
  ExtendedQuoteNode,
  extendedQuoteNodeReplacement,
} from '@kobato/inkling-internal/nodes/base/nodes/ExtendedQuoteNode'
import {
  ExtendedTextNode,
  extendedTextNodeReplacement,
} from '@kobato/inkling-internal/nodes/base/nodes/ExtendedTextNode'

export const EXTENDED_TEXT_NODE_PAIR = [ExtendedTextNode, extendedTextNodeReplacement]
export const EXTENDED_HEADING_NODE_PAIR = [ExtendedHeadingNode, extendedHeadingNodeReplacement]
export const EXTENDED_QUOTE_NODE_PAIR = [ExtendedQuoteNode, extendedQuoteNodeReplacement]
