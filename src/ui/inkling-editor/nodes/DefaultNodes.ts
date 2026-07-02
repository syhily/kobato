import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'

import { AsideNode } from '@/ui/inkling-editor/nodes/AsideNode'
import { AudioNode } from '@/ui/inkling-editor/nodes/AudioNode'
import {
  AtLinkNode,
  AtLinkSearchNode,
  ExtendedHeadingNode,
  ExtendedQuoteNode,
  ExtendedTextNode,
  TKNode,
  ZWNJNode,
  ensureLexicalNodeOwnMethods,
  extendedHeadingNodeReplacement,
  extendedQuoteNodeReplacement,
  extendedTextNodeReplacement,
} from '@/ui/inkling-editor/nodes/base'
import { BookmarkNode } from '@/ui/inkling-editor/nodes/BookmarkNode'
import { ButtonNode } from '@/ui/inkling-editor/nodes/ButtonNode'
import { CalloutNode } from '@/ui/inkling-editor/nodes/CalloutNode'
import { CodeBlockNode } from '@/ui/inkling-editor/nodes/CodeBlockNode'
import { FileNode } from '@/ui/inkling-editor/nodes/FileNode'
import { GalleryNode } from '@/ui/inkling-editor/nodes/GalleryNode'
import { HeaderNode } from '@/ui/inkling-editor/nodes/HeaderNode'
import { HorizontalRuleNode } from '@/ui/inkling-editor/nodes/HorizontalRuleNode'
import { HtmlNode } from '@/ui/inkling-editor/nodes/HtmlNode'
import { ImageNode } from '@/ui/inkling-editor/nodes/ImageNode'
import { ToggleNode } from '@/ui/inkling-editor/nodes/ToggleNode'
import { VideoNode } from '@/ui/inkling-editor/nodes/VideoNode'

const RAW_NODES = [
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
  CodeBlockNode,
  HorizontalRuleNode,
  ImageNode,
  AudioNode,
  VideoNode,
  CalloutNode,
  HtmlNode,
  FileNode,
  ButtonNode,
  ToggleNode,
  HeaderNode,
  BookmarkNode,
  GalleryNode,
  TKNode,
  AtLinkNode,
  AtLinkSearchNode,
  ZWNJNode,
]

for (const node of RAW_NODES) {
  ensureLexicalNodeOwnMethods(node)
}

const DEFAULT_NODES = RAW_NODES

export default DEFAULT_NODES
