// Node-type whitelist for the Lexical storage format. Single source of truth:
// both zod schemas (`schema.ts` / `comment-schema.ts`) and the composer
// contract test consume these constants — the editor must never produce a node
// the server rejects, nor vice versa.
//
// Families: upstream Lexical (`lexical` / `@lexical/*`) core/list/link/table
// classes, and inkling classes (`src/inkling/nodes/**`). inkling's three
// extended nodes REPLACE their upstream base via Lexical's node replacement
// (`src/inkling/nodes/base/nodes/extended-node-pairs.ts`) and their exportJSON
// rewrites `type`, so serialized payloads only ever carry the `extended-*`
// strings — never upstream `text` / `heading` / `quote`.

/** Serialized only as the state's top-level container, never as a child. */
export const ROOT_NODE_TYPE = 'root'

/**
 * Kobato host cards. Named constants because the card spec modules under
 * `@/shared/lexical/cards/` consume them verbatim and `projection-state.ts`
 * special-cases the set.
 */
export const SOLUTION_NODE_TYPE = 'solution'
export const TWO_COLUMN_NODE_TYPE = 'two-column'
export const MUSIC_PLAYER_NODE_TYPE = 'music-player'
export const KOBATO_HOST_CARD_NODE_TYPES = [SOLUTION_NODE_TYPE, TWO_COLUMN_NODE_TYPE, MUSIC_PLAYER_NODE_TYPE] as const

export const FULL_EDITOR_NODE_TYPES = [
  // Lexical core ParagraphNode / LineBreakNode.
  'paragraph',
  'linebreak',
  // src/inkling/nodes/base/nodes/ExtendedTextNode.ts — replaces TextNode.
  'extended-text',
  // src/inkling/nodes/base/nodes/ExtendedHeadingNode.ts — replaces HeadingNode (h1–h6).
  'extended-heading',
  // src/inkling/nodes/base/nodes/ExtendedQuoteNode.ts — replaces QuoteNode.
  'extended-quote',
  // @lexical/list ListNode / ListItemNode; lists nest via list > listitem > list.
  'list',
  'listitem',
  // @lexical/link LinkNode / AutoLinkNode; autolink appears because inkling's
  // CorePlugins mount registerAutoLink — imported `<a>` markup stays plain `link`.
  'link',
  'autolink',
  // inkling image card (src/inkling/nodes/cards/image.declaration.ts).
  // KobatoImageNode subclasses it via same-type replacement, so the type stays
  // `image` (the kobato pass-through keys ride the dataset — see schema.ts).
  'image',
  // inkling code card.
  'codeblock',
  // inkling block-math card.
  'math',
  // src/inkling/nodes/math/MathInlineNode.ts — inline decorator (cards are
  // block-level, so this one is hand-written).
  'math-inline',
  // Footnote pair: FootnoteRefNode (TextNode entity) and the menu-less
  // footnotedefinition card at the doc-end definition run.
  'footnote-ref',
  'footnotedefinition',
  'horizontalrule',
  // @lexical/table TableNode / TableRowNode / TableCellNode, mounted by inkling
  // as INKLING_TABLE_NODES.
  'table',
  'tablerow',
  'tablecell',
  ...KOBATO_HOST_CARD_NODE_TYPES,
] as const

export type FullEditorNodeType = (typeof FULL_EDITOR_NODE_TYPES)[number]

/**
 * Comment editing state — the restricted subset (multi-paragraph, blockquote,
 * nested lists, code block, link). `math` / `math-inline` are STORAGE-ONLY: the
 * composer does not mount them (formulas are ```math fences), but older bodies
 * still validate and are downgraded to the fence dialect at editor seed time
 * (`@/client/editor/comment-legacy-math`). `autolink` rides wherever the plugin
 * is mounted; the contract test keeps both sides in sync.
 */
export const COMMENT_NODE_TYPES = [
  'paragraph',
  'linebreak',
  'extended-text',
  'extended-quote',
  'list',
  'listitem',
  'link',
  'autolink',
  'codeblock',
  'math',
  'math-inline',
] as const

export type CommentNodeType = (typeof COMMENT_NODE_TYPES)[number]
