export { GeneratedDecoratorNodeBase } from '@/ui/inkling-editor/nodes/base/generate-decorator-node'
export * from '@/ui/inkling-editor/nodes/base/export-dom'
export { ensureLexicalNodeOwnMethods } from '@/ui/inkling-editor/nodes/base/ensure-node-own-methods'

import { AsideNode } from '@/ui/inkling-editor/nodes/base/nodes/aside/AsideNode'
import { AtLinkNode, AtLinkSearchNode } from '@/ui/inkling-editor/nodes/base/nodes/at-link/index'
import { AudioNode } from '@/ui/inkling-editor/nodes/base/nodes/audio/AudioNode'
import { BookmarkNode } from '@/ui/inkling-editor/nodes/base/nodes/bookmark/BookmarkNode'
import { ButtonNode } from '@/ui/inkling-editor/nodes/base/nodes/button/ButtonNode'
import { CalloutNode } from '@/ui/inkling-editor/nodes/base/nodes/callout/CalloutNode'
import { CodeBlockNode } from '@/ui/inkling-editor/nodes/base/nodes/codeblock/CodeBlockNode'
import {
  ExtendedHeadingNode,
  extendedHeadingNodeReplacement,
} from '@/ui/inkling-editor/nodes/base/nodes/ExtendedHeadingNode'
import { ExtendedQuoteNode, extendedQuoteNodeReplacement } from '@/ui/inkling-editor/nodes/base/nodes/ExtendedQuoteNode'
import { ExtendedTextNode, extendedTextNodeReplacement } from '@/ui/inkling-editor/nodes/base/nodes/ExtendedTextNode'
import { FileNode } from '@/ui/inkling-editor/nodes/base/nodes/file/FileNode'
import { GalleryNode } from '@/ui/inkling-editor/nodes/base/nodes/gallery/GalleryNode'
import { HeaderNode } from '@/ui/inkling-editor/nodes/base/nodes/header/HeaderNode'
import { HorizontalRuleNode } from '@/ui/inkling-editor/nodes/base/nodes/horizontalrule/HorizontalRuleNode'
import { HtmlNode } from '@/ui/inkling-editor/nodes/base/nodes/html/HtmlNode'
import { ImageNode } from '@/ui/inkling-editor/nodes/base/nodes/image/ImageNode'
import { MarkdownNode } from '@/ui/inkling-editor/nodes/base/nodes/markdown/MarkdownNode'
import { TKNode } from '@/ui/inkling-editor/nodes/base/nodes/TKNode'
import { ToggleNode } from '@/ui/inkling-editor/nodes/base/nodes/toggle/ToggleNode'
import { VideoNode } from '@/ui/inkling-editor/nodes/base/nodes/video/VideoNode'
import { ZWNJNode } from '@/ui/inkling-editor/nodes/base/nodes/zwnj/ZWNJNode'
import linebreakSerializers from '@/ui/inkling-editor/nodes/base/serializers/linebreak'
import paragraphSerializers from '@/ui/inkling-editor/nodes/base/serializers/paragraph'

// re-export everything for easier importing
export * from '@/ui/inkling-editor/nodes/base/InklingDecoratorNode'
export * from '@/ui/inkling-editor/nodes/base/nodes/image/ImageNode'
export * from '@/ui/inkling-editor/nodes/base/nodes/codeblock/CodeBlockNode'
export * from '@/ui/inkling-editor/nodes/base/nodes/markdown/MarkdownNode'
export * from '@/ui/inkling-editor/nodes/base/nodes/video/VideoNode'
export * from '@/ui/inkling-editor/nodes/base/nodes/audio/AudioNode'
export * from '@/ui/inkling-editor/nodes/base/nodes/callout/CalloutNode'
export * from '@/ui/inkling-editor/nodes/base/nodes/aside/AsideNode'
export * from '@/ui/inkling-editor/nodes/base/nodes/horizontalrule/HorizontalRuleNode'
export * from '@/ui/inkling-editor/nodes/base/nodes/html/HtmlNode'
export * from '@/ui/inkling-editor/nodes/base/nodes/toggle/ToggleNode'
export * from '@/ui/inkling-editor/nodes/base/nodes/button/ButtonNode'
export * from '@/ui/inkling-editor/nodes/base/nodes/bookmark/BookmarkNode'
export * from '@/ui/inkling-editor/nodes/base/nodes/file/FileNode'
export * from '@/ui/inkling-editor/nodes/base/nodes/header/HeaderNode'
export * from '@/ui/inkling-editor/nodes/base/nodes/gallery/GalleryNode'
export * from '@/ui/inkling-editor/nodes/base/nodes/ExtendedTextNode'
export * from '@/ui/inkling-editor/nodes/base/nodes/ExtendedHeadingNode'
export * from '@/ui/inkling-editor/nodes/base/nodes/ExtendedQuoteNode'
export * from '@/ui/inkling-editor/nodes/base/nodes/TKNode'
export * from '@/ui/inkling-editor/nodes/base/nodes/at-link/index'
export * from '@/ui/inkling-editor/nodes/base/nodes/zwnj/ZWNJNode'

import { generateDecoratorNode } from '@/ui/inkling-editor/nodes/base/generate-decorator-node'
import { rgbToHex } from '@/ui/inkling-editor/nodes/base/utils/rgb-to-hex'
import { html, oneline } from '@/ui/inkling-editor/nodes/base/utils/tagged-template-fns'
// export utility functions that are useful in other packages or tests
import {
  ALL_MEMBERS_SEGMENT,
  FREE_MEMBERS_SEGMENT,
  NO_MEMBERS_SEGMENT,
  PAID_MEMBERS_SEGMENT,
  buildDefaultVisibility,
  isOldVisibilityFormat,
  isVisibilityRestricted,
  migrateOldVisibilityFormat,
  renderWithVisibility,
  type Visibility,
} from '@/ui/inkling-editor/nodes/base/utils/visibility'
export const utils = {
  generateDecoratorNode,
  visibility: {
    ALL_MEMBERS_SEGMENT,
    FREE_MEMBERS_SEGMENT,
    NO_MEMBERS_SEGMENT,
    PAID_MEMBERS_SEGMENT,
    buildDefaultVisibility,
    isOldVisibilityFormat,
    isVisibilityRestricted,
    migrateOldVisibilityFormat,
    renderWithVisibility,
  },
  rgbToHex,
  taggedTemplateFns: { oneline, html },
}
export type { Visibility }

export const serializers = {
  linebreak: linebreakSerializers,
  paragraph: paragraphSerializers,
}

export const DEFAULT_CONFIG = {
  html: {
    import: {
      ...serializers.linebreak.import,
      ...serializers.paragraph.import,
    },
  },
}

// export convenience objects for use elsewhere
export const DEFAULT_NODES = [
  ExtendedTextNode,
  extendedTextNodeReplacement,
  ExtendedHeadingNode,
  extendedHeadingNodeReplacement,
  ExtendedQuoteNode,
  extendedQuoteNodeReplacement,
  CodeBlockNode,
  ImageNode,
  MarkdownNode,
  VideoNode,
  AudioNode,
  CalloutNode,
  AsideNode,
  HorizontalRuleNode,
  HtmlNode,
  FileNode,
  ToggleNode,
  ButtonNode,
  HeaderNode,
  BookmarkNode,
  GalleryNode,
  TKNode,
  AtLinkNode,
  AtLinkSearchNode,
  ZWNJNode,
]
