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

// re-export everything for easier importing
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

// The named node runs every surface composes — the facts used to be spelled
// per surface (FootnoteRefNode once had to be added to two lists). The
// extended-node pairs live in a cycle-free leaf (extended-node-pairs.ts) so
// MINIMAL_NODES can compose them; the barrel re-exports them here.
export { EXTENDED_HEADING_NODE_PAIR, EXTENDED_QUOTE_NODE_PAIR, EXTENDED_TEXT_NODE_PAIR }

/** The entity-node tail closing the editor's node sets. */
export const ENTITY_TAIL_NODES = [TKNode, AtLinkNode, AtLinkSearchNode, ZWNJNode, MathInlineNode, FootnoteRefNode]

// The base node set: the extended-node pairs, then every declaration's base
// node in DECLARATION order — the same order the editor node set
// (src/nodes/DefaultNodes.ts) composes. MarkdownNode and AsideNode are
// base-only nodes with no declaration to derive from, so they head the card
// run. Registration order carries no runtime semantics (node types are
// unique; replacements ride the named pairs), so no legacy rank is
// preserved — the pinned literal in test/unit/nodes/derived-node-sets.test.ts
// guards drift, not history.
export const DEFAULT_NODES = [
  ...EXTENDED_TEXT_NODE_PAIR,
  ...EXTENDED_HEADING_NODE_PAIR,
  ...EXTENDED_QUOTE_NODE_PAIR,
  MarkdownNode,
  AsideNode,
  ...CARD_DECLARATIONS.map((card) => card.baseNode),
  ...ENTITY_TAIL_NODES,
]
