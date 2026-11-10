export type { GeneratedDecoratorNodeBase } from '@/inkling/nodes/base/generate-decorator-node'
export { $updateCardNode } from '@/inkling/nodes/base/update-card-node'
export type * from '@/inkling/nodes/base/export-dom'
export { ensureLexicalNodeOwnMethods } from '@/inkling/nodes/base/ensure-node-own-methods'

import { AsideNode } from '@/inkling/nodes/base/nodes/aside/AsideNode'
import { AtLinkNode, AtLinkSearchNode } from '@/inkling/nodes/base/nodes/at-link/index'
import {
  EXTENDED_HEADING_NODE_PAIR,
  EXTENDED_QUOTE_NODE_PAIR,
  EXTENDED_TEXT_NODE_PAIR,
} from '@/inkling/nodes/base/nodes/extended-node-pairs'
import { MarkdownNode } from '@/inkling/nodes/base/nodes/markdown/MarkdownNode'
import { TKNode } from '@/inkling/nodes/base/nodes/TKNode'
import { ZWNJNode } from '@/inkling/nodes/base/nodes/zwnj/ZWNJNode'
import { linebreakSerializers } from '@/inkling/nodes/base/serializers/linebreak'
import { paragraphSerializers } from '@/inkling/nodes/base/serializers/paragraph'
import { CARD_DECLARATIONS } from '@/inkling/nodes/cards'
import { FootnoteRefNode } from '@/inkling/nodes/footnote/FootnoteRefNode'
import { MathInlineNode } from '@/inkling/nodes/math/MathInlineNode'

export * from '@/inkling/nodes/base/InklingDecoratorNode'
export * from '@/inkling/nodes/base/nodes/image/ImageNode'
export * from '@/inkling/nodes/base/nodes/codeblock/CodeBlockNode'
export * from '@/inkling/nodes/base/nodes/markdown/MarkdownNode'
export * from '@/inkling/nodes/base/nodes/video/VideoNode'
export * from '@/inkling/nodes/base/nodes/audio/AudioNode'
export * from '@/inkling/nodes/base/nodes/callout/CalloutNode'
export * from '@/inkling/nodes/base/nodes/aside/AsideNode'
export * from '@/inkling/nodes/base/nodes/horizontalrule/HorizontalRuleNode'
export * from '@/inkling/nodes/base/nodes/html/HtmlNode'
export * from '@/inkling/nodes/base/nodes/toggle/ToggleNode'
export * from '@/inkling/nodes/base/nodes/button/ButtonNode'
export * from '@/inkling/nodes/base/nodes/bookmark/BookmarkNode'
export * from '@/inkling/nodes/base/nodes/file/FileNode'
export * from '@/inkling/nodes/base/nodes/header/HeaderNode'
export * from '@/inkling/nodes/base/nodes/gallery/GalleryNode'
export * from '@/inkling/nodes/base/nodes/math/MathNode'
export * from '@/inkling/nodes/base/nodes/ExtendedTextNode'
export * from '@/inkling/nodes/base/nodes/ExtendedHeadingNode'
export * from '@/inkling/nodes/base/nodes/ExtendedQuoteNode'
export * from '@/inkling/nodes/base/nodes/TKNode'
export * from '@/inkling/nodes/base/nodes/at-link/index'
export * from '@/inkling/nodes/base/nodes/zwnj/ZWNJNode'
export * from '@/inkling/nodes/base/nodes/footnotedefinition/FootnoteDefinitionNode'

const serializers = {
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

// The extended-node pairs live in a cycle-free leaf (extended-node-pairs.ts) so
// MINIMAL_NODES can compose them; the barrel re-exports them here.
export { EXTENDED_HEADING_NODE_PAIR, EXTENDED_QUOTE_NODE_PAIR, EXTENDED_TEXT_NODE_PAIR }

/** The entity-node tail closing the editor's node sets. */
export const ENTITY_TAIL_NODES = [TKNode, AtLinkNode, AtLinkSearchNode, ZWNJNode, MathInlineNode, FootnoteRefNode]

// The React-free base-class node set: the extended-node pairs, then every
// declaration's base node in declaration order (MarkdownNode/AsideNode head the
// run — no declaration), closing with the entity tail. Excludes the assembled
// wrapper cards, which only the editor surface composes (`EDITOR_BASE_NODES`);
// registration order carries no runtime semantics. Pinned by
// `tests/inkling/unit/nodes/derived-node-sets.test.ts`.
export const DEFAULT_BASE_NODES = [
  ...EXTENDED_TEXT_NODE_PAIR,
  ...EXTENDED_HEADING_NODE_PAIR,
  ...EXTENDED_QUOTE_NODE_PAIR,
  MarkdownNode,
  AsideNode,
  ...CARD_DECLARATIONS.map((card) => card.baseNode),
  ...ENTITY_TAIL_NODES,
]
