import type { Klass, LexicalNode } from 'lexical'

import type { CardConfig, FileUploader } from '@/context/InklingHostIntegrationContext'
import type { NestedEditorSpec, TransientPropSpec } from '@/nodes/base/card-specs'
import type { CardImportSpec } from '@/nodes/base/import-spec'
import type { CardWidth } from '@/nodes/base/utils/card-widths'

/**
 * The class every declaration's baseNode is: a generateDecoratorNode
 * product. The registry projections widen to Klass<LexicalNode> (the
 * per-card dataset type is dropped there — see CARD_WRAPPER_NODES), but the
 * generated statics are genuinely present on every built-in and host class;
 * the field types them so readers reach importSpec/getPropertyDefaults
 * without casting through unknown.
 */
export type CardBaseNodeClass = Klass<LexicalNode> & {
  getPropertyDefaults(): Record<string, unknown>
  readonly importSpec?: CardImportSpec
  readonly urlTransformMap: Record<string, string | Record<string, string>>
}

/**
 * The card's decorate-target wrapper props (CONTEXT.md: "card spec") — the
 * React-free half of what a card's `decorate()` passes to
 * `InklingCardWrapper`. The component render and the `IndicatorIcon`
 * component attach one layer up beside each card's component in the
 * `*NodeComponent` files (paired with the declaration by
 * `@/nodes/cards/card-decorate`) because they are React-bearing; the shared
 * adapter (`@/nodes/decorate-card`) merges both halves. Cards with no wrapper props (Audio, Bookmark, Callout, File,
 * HorizontalRule) omit this entry.
 *
 * `width` is either a constant or a node→width mapper for cards whose width
 * is runtime node state (Image/Video read `cardWidth`; Header maps its
 * `layout`). Per-card width defaults live here — the split of this knowledge
 * across thirteen decorate bodies is what caused the `b60bd7c` regression.
 * `hasIndicatorIcon` is the React-free record that the card renders an
 * indicator icon; the projection only attaches the icon component when this
 * flag is set (Html is the only card that does).
 */
export interface DecorateTargetSpec {
  width?: CardWidth | ((node: LexicalNode) => CardWidth | undefined)
  wrapperStyle?: string
  hasIndicatorIcon?: boolean
}

/**
 * The card's membership in the insert-command surface (CONTEXT.md: "card
 * declaration") — the per-card facts the eleven hand-written insert plugins
 * held: whether it dispatches `INSERT_CARD_COMMAND` with
 * `openInEditMode: true`, and whether it claims media inserts. The presence
 * of `insert` is the opt-in; an empty spec (file, gallery) is the common
 * case. CodeBlock and HorizontalRule omit the entry — they have no derived
 * insert registration. The insert command itself is NOT declared here: every
 * insert-bearing card joins exactly one insert command, derived from its
 * node type by `resolveCardInsertCommand` (`@/nodes/cards/card-commands`),
 * so the command can never drift from the card. React-free; the registrar
 * (`@/plugins/CardInsertPlugin`) is its derived view.
 */
export interface CardInsertSpec {
  /** dispatch INSERT_CARD_COMMAND with openInEditMode: true after construction */
  openInEditMode?: boolean
  /** claim INSERT_MEDIA_COMMAND payloads whose type equals this card's nodeType */
  claimsMediaInsert?: boolean
  /** bookmark only — historical; redundant with INSERT_CARD_COMMAND's own
      selection handling but observable in dispatch return values */
  requiresRangeSelection?: boolean
  /** bookmark only — historical HIGH priority; every other card is LOW */
  insertCommandPriority?: 'high'
}

/**
 * The card menu icon ids (CONTEXT.md: "card declaration" names the card menu
 * as part of the declaration's knowledge). Naming the icon by id keeps the
 * declaration React-free; the SVGR icon components attach one layer up in
 * `@/nodes/cards/card-menus`.
 */
export type CardIconId =
  | 'audio'
  | 'bookmark'
  | 'button'
  | 'callout'
  | 'codeblock'
  | 'divider'
  | 'file'
  | 'gallery'
  | 'gif'
  | 'header'
  | 'html'
  | 'image'
  | 'math'
  | 'toggle'
  | 'video'

/**
 * The command a menu entry dispatches, NAMED instead of referenced: the
 * direction reversal that makes `@/nodes/cards/card-commands` a derived view
 * over the declarations rather than a module they import. `'insert'` names
 * the entry's own card insert command (derived from the declaration's node
 * type by `resolveCardInsertCommand`, so menu entry order never carries
 * command semantics — Image's second entry is the GIF selector, not an
 * insert command); the two named extras are the Image card's selector
 * commands. Host menu entries may additionally carry a raw
 * `LexicalCommand` for a host-defined command (see
 * `HostCardMenuEntrySpec` in `@/nodes/cards/host-card-registry`). The menu
 * projection (`@/nodes/cards/card-menus`) resolves the name to the command
 * object through `resolveCardMenuCommand`.
 */
export type CardMenuCommand = 'insert' | 'openGifSelector' | 'openImageLibrary'

/**
 * One slash/plus menu entry, React-free: everything a `MenuItem`
 * (`@/nodes/cards/card-menu-build`) carries except the icon component and the command
 * object, which are named by id (`CardIconId` / `CardMenuCommand`) and
 * resolved one layer up instead. The derived view in
 * `@/nodes/cards/card-menus` resolves `icon` to the SVGR component and
 * `command` to the entry's `insertCommand`.
 */
export interface CardMenuEntrySpec {
  label: string
  /** the labels-table stem this entry resolves through at menu-build time
   * (`menu.${labelKey}.label` / `.desc`). The
   * English `label`/`desc` stay the self-describing defaults — resolution is
   * an override, never a replacement. */
  labelKey: string
  desc?: string
  icon: CardIconId
  /** the command this entry dispatches, named — see `CardMenuCommand` */
  command: CardMenuCommand
  insertParams?: Record<string, unknown> | (() => Record<string, unknown>)
  matches?: string[]
  priority?: number
  shortcut?: string
  queryParams?: string[]
  isHidden?: (args: { config: CardConfig | undefined }) => boolean
}

/**
 * The card's upload-claiming key — one of the media keys of the host
 * uploader's `fileTypes` (`FileUploader` in
 * `@/context/InklingHostIntegrationContext`). `DragDropPastePlugin` looks the
 * key up to learn which mime types claim a drag/drop or paste insert for the
 * card's node type. Only the four media cards (Audio, File, Image, Video)
 * carry one.
 */
export type CardUploadType = keyof NonNullable<FileUploader['fileTypes']>

/**
 * How the card joins the markdown round-trip (`MARKDOWN_NODES` in
 * `@/markdown/round-trip`):
 *
 * - `{ kind: 'fence' }` — the card speaks a ` ```inkling:<card>``` ` fence.
 *   The per-card payload vocabulary (`getData`/`createNode`) attaches one
 *   layer up in `@/nodes/cards/card-markdown-transformers`, keyed
 *   exhaustively by the fence declarations' node types: the payload's
 *   `createNode` must construct the wrapper node class the round-trip editor
 *   registers, which the React-free declaration modules must never import.
 * - `{ kind: 'exempt' }` — markdown-eligible with no card fence: CodeBlock
 *   and HorizontalRule speak the dialect's own transformers (`CODE_FENCE` /
 *   `HR`, covered by `DEFAULT_TRANSFORMERS`), and Image speaks standard
 *   `![alt](src)` syntax via its hand-written transformer.
 *
 * Cards with no `markdown` entry (Header, Math, the footnote definition) sit
 * out the round-trip entirely.
 */
export type CardMarkdownSpec = { kind: 'fence' } | { kind: 'exempt' }

/**
 * The single per-card source of truth (CONTEXT.md: "card declaration"). Every
 * card registry is a derived view over these declarations: the menus
 * (`@/nodes/cards/card-menus`), the decorate renders
 * (`@/nodes/cards/card-decorate`), the wrapper node classes
 * (`@/nodes/cards/card-wrappers`), and the insert registrations
 * (`@/nodes/cards/card-insert-commands`). Adding a card means adding its
 * declaration here plus its per-card React module — nothing is
 * hand-maintained in two places.
 *
 * React-free: `baseNode` is imported from its deep `@/nodes/base/nodes/...`
 * path so `@/nodes/base` can derive its node set from the declarations
 * without pulling in the wrapper/component layer. The wrapper node class and
 * the React-bearing decorate/menu pieces attach one layer up — the
 * declarations must never import wrappers, or the base barrel would close an
 * import cycle through the wrapper files. Menu icons and component renders
 * are therefore named by id (`CardIconId`) or attached beside each card's
 * component in the `*NodeComponent` files.
 *
 * Declarations use `satisfies CardDeclaration<'<nodeType>'>` so the literal
 * node type survives on the declaration's type.
 */
export interface CardDeclaration<NodeType extends string = string> {
  nodeType: NodeType
  baseNode: CardBaseNodeClass
  /**
   * The card's nested editors (CONTEXT.md: "card spec"), for cards that keep
   * rich-text content in nested Lexical editors. The wrapper node class
   * adopts this as its static `nestedEditors`; the generated node machinery
   * (`@/nodes/base/generate-decorator-node`) drives constructor setup,
   * `getDataset` appends, and `exportJSON` re-serialization from it. Keep
   * the spec array `as const` in the declaration file: the shim's `__*`
   * field map derives its keys from the literal names (`CardSpecFieldMap`).
   */
  nestedEditors?: readonly NestedEditorSpec[]
  /**
   * The card's transient props (CONTEXT.md: "card spec") — client-side-only
   * fields (upload flow state, edit-mode flags) read from the construction
   * dataset, initialized by the generated node machinery, and never
   * serialized. The wrapper node class adopts this as its static
   * `transientProps`; see `TransientPropSpec` in
   * `@/nodes/base/generate-decorator-node`. Keep the spec array `as const`
   * in the declaration file, as for `nestedEditors`.
   */
  transientProps?: readonly TransientPropSpec[]
  /**
   * The card's decorate-target wrapper props; see `DecorateTargetSpec`.
   */
  decorateTarget?: DecorateTargetSpec
  /**
   * The card's insert-command registration; see `CardInsertSpec`. Presence
   * opts the card into the insert-command surface.
   */
  insert?: CardInsertSpec
  /**
   * The card's slash/plus menu entries (CONTEXT.md: "card declaration");
   * see `CardMenuEntrySpec`. Menu-less cards: CodeBlock (inserted by its
   * markdown code fence) and the footnote definition (created/ordered by the
   * footnote behaviour module, never inserted by the user).
   */
  menu?: readonly CardMenuEntrySpec[]
  /**
   * The drag-preview icon for menu-less cards that are still user-draggable
   * (CodeBlock). Menu-bearing cards use their first entry's icon; the
   * footnote definition names none (the doc-end-run invariant re-parks it).
   * See `getCardDragIcon` in `@/nodes/cards/card-menus`.
   */
  dragIcon?: CardIconId
  /**
   * The card's upload-claiming key (CONTEXT.md: "card declaration") — see
   * `CardUploadType`. Historically a static on the base node classes read off
   * the registered class by `DragDropPastePlugin`; the declaration is its
   * single home now. Only the four media cards (Audio, File, Image, Video)
   * declare it; every other card omits the entry.
   */
  uploadType?: CardUploadType
  /**
   * The card's toolbar label — the `data-inkling-card-toolbar` value
   * `CardActionToolbar` renders on both of its toolbars (a live CSS/e2e
   * selector contract). It is resolved from the declaration by the node's own
   * type — the same path `data-inkling-card` takes — so the label cannot
   * drift from the card it annotates (the historical "signup" header label;
   * see `getCardToolbarLabel` in `@/nodes/cards/card-facts`). Most
   * cards label by node type; CodeBlock ("code-block") and File
   * ("file-upload") deliberately diverge — the divergence is data here, not a
   * transform of `nodeType`.
   */
  toolbarLabel: string
  /**
   * The card's markdown round-trip eligibility; see `CardMarkdownSpec`.
   * Absent means the card is not part of the round-trip.
   */
  markdown?: CardMarkdownSpec
}
