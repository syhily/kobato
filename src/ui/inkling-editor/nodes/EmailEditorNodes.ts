import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'

import { AsideNode } from '@/ui/inkling-editor/nodes/AsideNode'
import {
  ExtendedHeadingNode,
  ExtendedQuoteNode,
  ExtendedTextNode,
  ensureLexicalNodeOwnMethods,
  extendedHeadingNodeReplacement,
  extendedQuoteNodeReplacement,
  extendedTextNodeReplacement,
} from '@/ui/inkling-editor/nodes/base'
import { BookmarkNode } from '@/ui/inkling-editor/nodes/BookmarkNode'
import { ButtonNode } from '@/ui/inkling-editor/nodes/ButtonNode'
import { CalloutNode } from '@/ui/inkling-editor/nodes/CalloutNode'
import { HorizontalRuleNode } from '@/ui/inkling-editor/nodes/HorizontalRuleNode'
import { HtmlNode } from '@/ui/inkling-editor/nodes/HtmlNode'
import { ImageNode } from '@/ui/inkling-editor/nodes/ImageNode'

/**
 * Node set for the email editor. Slimmed down version of the default nodes exempting those that aren't meant for email.
 */
const EMAIL_EDITOR_NODES = [
  // Base text nodes
  ExtendedTextNode,
  extendedTextNodeReplacement,
  HeadingNode,
  ExtendedHeadingNode,
  extendedHeadingNodeReplacement,
  QuoteNode,
  ExtendedQuoteNode,
  extendedQuoteNodeReplacement,
  ListNode,
  ListItemNode,
  AsideNode,
  LinkNode,

  // Cards for email
  HorizontalRuleNode,
  ImageNode,
  CalloutNode,
  HtmlNode,
  ButtonNode,
  BookmarkNode,
]

for (const node of EMAIL_EDITOR_NODES) {
  ensureLexicalNodeOwnMethods(node)
}

export default EMAIL_EDITOR_NODES
