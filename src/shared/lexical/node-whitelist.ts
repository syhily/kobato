// Node-type whitelist for the Lexical storage format (plan
// docs/plans/inkling-editor-replacement.md, round R7). Single source of
// truth: both zod schemas (`schema.ts` / `comment-schema.ts`) and the R11
// composer contract test consume these constants — the editor must never
// produce a node the server rejects, nor vice versa.
//
// Every type string was verified against the node class that serializes it
// (source cited per entry). Two families:
//
// - Upstream Lexical 0.46 (`lexical` / `@lexical/*` — the whole lexical
//   family is pinned at 0.46.0 by inkling; verified against the installed
//   dist bundles and .d.ts files under node_modules).
// - inkling node classes (packages/inkling/src/nodes/**). inkling's three
//   extended nodes REPLACE their upstream base via Lexical's node
//   replacement mechanism (src/nodes/base/nodes/extended-node-pairs.ts) and
//   their exportJSON rewrites `type`, so serialized payloads only ever carry
//   the `extended-*` strings — never upstream `text` / `heading` / `quote`.

/** Serialized only as the state's top-level container, never as a child —
 * lexical core RootNode (`lexical` dist Lexical.dev.mjs `getType`). */
export const ROOT_NODE_TYPE = 'root'

/**
 * Article/page editing state — kobato's full target node set.
 */
export const FULL_EDITOR_NODE_TYPES = [
  // lexical core ParagraphNode / LineBreakNode (dist Lexical.dev.mjs).
  'paragraph',
  'linebreak',
  // packages/inkling/src/nodes/base/nodes/ExtendedTextNode.ts:23 —
  // replaces TextNode (carries format/mode/detail/style like upstream).
  'extended-text',
  // packages/inkling/src/nodes/base/nodes/ExtendedHeadingNode.ts:28 —
  // replaces HeadingNode (`tag` h1–h6).
  'extended-heading',
  // packages/inkling/src/nodes/base/nodes/ExtendedQuoteNode.ts:23 —
  // replaces QuoteNode.
  'extended-quote',
  // @lexical/list ListNode / ListItemNode (dist LexicalList.dev.js
  // `config('list')` / `config('listitem')`); lists nest via
  // list > listitem > list.
  'list',
  'listitem',
  // @lexical/link LinkNode / AutoLinkNode (dist LexicalLink.dev.mjs);
  // autolink nodes appear because inkling's CorePlugins mount
  // registerAutoLink (R4) — imported `<a>` markup stays plain `link`.
  'link',
  'autolink',
  // inkling image card: packages/inkling/src/nodes/cards/
  // image.declaration.ts:50. The R3 verdict subclasses it as
  // KobatoImageNode via same-type replacement, so the type stays `image`
  // (the kobato pass-through keys ride the dataset — see schema.ts).
  'image',
  // inkling code card: packages/inkling/src/nodes/cards/
  // codeblock.declaration.ts:25.
  'codeblock',
  // inkling block-math card: packages/inkling/src/nodes/cards/
  // math.declaration.ts:6.
  'math',
  // packages/inkling/src/nodes/math/MathInlineNode.ts:42 — inline
  // decorator (cards are block-level, so this one is hand-written).
  'math-inline',
  // Footnote pair: packages/inkling/src/nodes/footnote/
  // FootnoteRefNode.ts:28 (TextNode entity) and packages/inkling/src/
  // nodes/cards/footnotedefinition.declaration.ts:23 (menu-less card at
  // the doc-end definition run).
  'footnote-ref',
  'footnotedefinition',
  // packages/inkling/src/nodes/cards/horizontalrule.declaration.ts:6.
  'horizontalrule',
  // @lexical/table TableNode / TableRowNode / TableCellNode (dist
  // LexicalTable.dev.mjs `getType` returns), mounted by inkling as
  // INKLING_TABLE_NODES.
  'table',
  'tablerow',
  'tablecell',
  // kobato host cards (plan M3, landing in R10 via `defineCard`): the
  // type strings are pinned HERE and R10's defineCard calls must use them
  // verbatim; the R11 contract test then pins composer ↔ whitelist.
  'solution',
  'two-column',
  'music-player',
] as const

export type FullEditorNodeType = (typeof FULL_EDITOR_NODE_TYPES)[number]

/**
 * Comment editing state — the restricted subset mirroring the PT
 * `comment-schema.ts` capability set (multi-paragraph, blockquote, nested
 * lists, code block, math block, link, math-inline; no headings, images,
 * tables, footnotes, horizontal rules, or host cards). `autolink` is
 * included provisionally: typed URLs autolink wherever the plugin is
 * mounted — if the R12 comment composer ships without AutoLinkNode, drop
 * it here; the contract test keeps both sides in sync.
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
