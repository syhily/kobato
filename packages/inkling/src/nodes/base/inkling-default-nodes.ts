export type { GeneratedDecoratorNodeBase } from '@/nodes/base/generate-decorator-node'
export { $updateCardNode } from '@/nodes/base/update-card-node'
export * from '@/nodes/base/export-dom'
export { ensureLexicalNodeOwnMethods } from '@/nodes/base/ensure-node-own-methods'

import { AsideNode } from '@/nodes/base/nodes/aside/AsideNode'
import { AtLinkNode, AtLinkSearchNode } from '@/nodes/base/nodes/at-link/index'
import {
  EXTENDED_HEADING_NODE_PAIR,
  EXTENDED_QUOTE_NODE_PAIR,
  EXTENDED_TEXT_NODE_PAIR,
} from '@/nodes/base/nodes/extended-node-pairs'
import { MarkdownNode } from '@/nodes/base/nodes/markdown/MarkdownNode'
import { TKNode } from '@/nodes/base/nodes/TKNode'
import { ZWNJNode } from '@/nodes/base/nodes/zwnj/ZWNJNode'
import { linebreakSerializers } from '@/nodes/base/serializers/linebreak'
import { paragraphSerializers } from '@/nodes/base/serializers/paragraph'
import { CARD_DECLARATIONS } from '@/nodes/cards'
import { FootnoteRefNode } from '@/nodes/footnote/FootnoteRefNode'
import { MathInlineNode } from '@/nodes/math/MathInlineNode'

// re-export everything for easier importing
export * from '@/nodes/base/InklingDecoratorNode'
export * from '@/nodes/base/nodes/image/ImageNode'
export * from '@/nodes/base/nodes/codeblock/CodeBlockNode'
export * from '@/nodes/base/nodes/markdown/MarkdownNode'
export * from '@/nodes/base/nodes/video/VideoNode'
export * from '@/nodes/base/nodes/audio/AudioNode'
export * from '@/nodes/base/nodes/callout/CalloutNode'
export * from '@/nodes/base/nodes/aside/AsideNode'
export * from '@/nodes/base/nodes/horizontalrule/HorizontalRuleNode'
export * from '@/nodes/base/nodes/html/HtmlNode'
export * from '@/nodes/base/nodes/toggle/ToggleNode'
export * from '@/nodes/base/nodes/button/ButtonNode'
export * from '@/nodes/base/nodes/bookmark/BookmarkNode'
export * from '@/nodes/base/nodes/file/FileNode'
export * from '@/nodes/base/nodes/header/HeaderNode'
export * from '@/nodes/base/nodes/gallery/GalleryNode'
export * from '@/nodes/base/nodes/math/MathNode'
export * from '@/nodes/base/nodes/ExtendedTextNode'
export * from '@/nodes/base/nodes/ExtendedHeadingNode'
export * from '@/nodes/base/nodes/ExtendedQuoteNode'
export * from '@/nodes/base/nodes/TKNode'
export * from '@/nodes/base/nodes/at-link/index'
export * from '@/nodes/base/nodes/zwnj/ZWNJNode'
export * from '@/nodes/base/nodes/footnotedefinition/FootnoteDefinitionNode'

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
