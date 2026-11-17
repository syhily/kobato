export type { GeneratedDecoratorNodeBase } from './generate-decorator-node'
export { $updateCardNode } from './update-card-node'
export type * from './export-dom'
export { ensureLexicalNodeOwnMethods } from './ensure-node-own-methods'

import { CARD_DECLARATIONS } from '../cards'
import { FootnoteRefNode } from '../footnote/FootnoteRefNode'
import { MathInlineNode } from '../math/MathInlineNode'
import { AsideNode } from './nodes/aside/AsideNode'
import { AtLinkNode, AtLinkSearchNode } from './nodes/at-link/index'
import {
  EXTENDED_HEADING_NODE_PAIR,
  EXTENDED_QUOTE_NODE_PAIR,
  EXTENDED_TEXT_NODE_PAIR,
} from './nodes/extended-node-pairs'
import { MarkdownNode } from './nodes/markdown/MarkdownNode'
import { TKNode } from './nodes/TKNode'
import { ZWNJNode } from './nodes/zwnj/ZWNJNode'
import { linebreakSerializers } from './serializers/linebreak'
import { paragraphSerializers } from './serializers/paragraph'

export * from './InklingDecoratorNode'
export * from './nodes/image/ImageNode'
export * from './nodes/codeblock/CodeBlockNode'
export * from './nodes/markdown/MarkdownNode'
export * from './nodes/video/VideoNode'
export * from './nodes/audio/AudioNode'
export * from './nodes/callout/CalloutNode'
export * from './nodes/aside/AsideNode'
export * from './nodes/horizontalrule/HorizontalRuleNode'
export * from './nodes/html/HtmlNode'
export * from './nodes/toggle/ToggleNode'
export * from './nodes/button/ButtonNode'
export * from './nodes/bookmark/BookmarkNode'
export * from './nodes/file/FileNode'
export * from './nodes/header/HeaderNode'
export * from './nodes/gallery/GalleryNode'
export * from './nodes/math/MathNode'
export * from './nodes/ExtendedTextNode'
export * from './nodes/ExtendedHeadingNode'
export * from './nodes/ExtendedQuoteNode'
export * from './nodes/TKNode'
export * from './nodes/at-link/index'
export * from './nodes/zwnj/ZWNJNode'
export * from './nodes/footnotedefinition/FootnoteDefinitionNode'

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
