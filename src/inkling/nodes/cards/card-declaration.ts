import type { Klass, LexicalNode } from 'lexical'

import type { CardConfig, FileUploader } from '@/inkling/context/InklingHostIntegrationContext'
import type {
  CardSpecNestedEditorDataset,
  CardSpecTransientDataset,
  NestedEditorSpec,
  TransientPropSpec,
} from '@/inkling/nodes/base/card-specs'
import type { CardImportSpec } from '@/inkling/nodes/base/import-spec'
import type { CardWidth } from '@/inkling/nodes/base/utils/card-widths'

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
 * `@/inkling/nodes/cards/card-decorate`) because they are React-bearing; the shared
 * adapter (`@/inkling/nodes/decorate-card`) merges both halves. Cards with no wrapper props (Audio, Bookmark, Callout, File,
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
 * case. HorizontalRule and the footnote definition omit the entry — they have
 * no derived insert registration. The insert command itself is NOT declared here: every
 * insert-bearing card joins exactly one insert command, derived from its
 * node type by `resolveCardInsertCommand` (`@/inkling/nodes/cards/card-commands`),
 * so the command can never drift from the card. React-free; the registrar
 * (`@/inkling/plugins/CardInsertPlugin`) is its derived view.
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
 * `@/inkling/nodes/cards/card-menus`.
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
 * direction reversal that makes `@/inkling/nodes/cards/card-commands` a derived view
 * over the declarations rather than a module they import. `'insert'` names
 * the entry's own card insert command (derived from the declaration's node
 * type by `resolveCardInsertCommand`, so menu entry order never carries
 * command semantics — Image's second entry is the GIF selector, not an
 * insert command); the two named extras are the Image card's selector
 * commands. Host menu entries may additionally carry a raw
 * `LexicalCommand` for a host-defined command (see
 * `HostCardMenuEntrySpec` in `@/inkling/nodes/cards/host-card-registry`). The menu
 * projection (`@/inkling/nodes/cards/card-menus`) resolves the name to the command
 * object through `resolveCardMenuCommand`.
 */
export type CardMenuCommand = 'insert' | 'openGifSelector' | 'openImageLibrary'

/**
 * The construction-dataset vocabulary a card's menu entries may name — the
 * payload type of `insertParams` and the key type of `queryParams`.
 *
 * Derived, never restated: the dataset properties come from the base class's
 * `getPropertyDefaults()` return type (the generated
 * `DecoratorNodeValueMap`), and the transient-prop / nested-editor
 * construction keys come from the same spec arrays the declarations already
 * carry (`CardSpecTransientDataset` / `CardSpecNestedEditorDataset`). The
 * three sources are the exact vocabulary `CardInsertPlugin`'s `new node(dataset)`
 * consumes, so a menu entry can no longer name a key the card's constructor
 * silently ignores (Image's `triggerFileDialog` typo).
 *
 * A declaration must pass its base class and spec array types to get the
 * precise dataset; `DeclaredCardMenuDataset` turns the un-parameterized
 * defaults into `never`, so omitting them makes `insertParams`/`queryParams`
 * unusable rather than silently open (the registry's existential alias is
 * `AnyCardDeclaration`, whose menu stays loose). Host specs use
 * `HostCardMenuEntrySpec`, never this default.
 */
export type CardMenuDataset<
  Base extends CardBaseNodeClass,
  Transient extends readonly TransientPropSpec[] | undefined = readonly TransientPropSpec[],
  Nested extends readonly NestedEditorSpec[] | undefined = readonly NestedEditorSpec[],
> = Partial<ReturnType<Base['getPropertyDefaults']>> &
  CardMenuTransientDataset<Transient> &
  CardMenuNestedEditorDataset<Nested>

// A broad spec array (the un-parameterized declaration's default) cannot name
// literal dataset keys, so it degrades to the open record — exactly the
// pre-parameterization behaviour. A const-asserted tuple (every base node
// module's `as const satisfies` idiom) is precise, including the empty tuple.
type CardMenuTransientDataset<Specs> = Specs extends readonly TransientPropSpec[]
  ? number extends Specs['length']
    ? Record<string, unknown>
    : CardSpecTransientDataset<Specs>
  : unknown

type CardMenuNestedEditorDataset<Specs> = Specs extends readonly NestedEditorSpec[]
  ? number extends Specs['length']
    ? Record<string, unknown>
    : CardSpecNestedEditorDataset<Specs>
  : unknown

/**
 * The dataset a DECLARATION's menu is checked against. The un-parameterized
 * `CardDeclaration` defaults (the broad `CardBaseNodeClass` / spec arrays)
 * resolve to `never`, so a menu-bearing declaration that forgets its type
 * arguments cannot use `insertParams` or `queryParams`; a declaration that
 * spells `readonly []` for an absent spec array (or passes its const-asserted
 * array) gets the precise `CardMenuDataset`. This closes the "silent opt-in"
 * trap: the broad projection lives only on `AnyCardDeclaration`.
 */
type DeclaredCardMenuDataset<
  Base extends CardBaseNodeClass,
  Transient extends readonly TransientPropSpec[] | undefined,
  Nested extends readonly NestedEditorSpec[] | undefined,
> = CardBaseNodeClass extends Base
  ? never
  : Transient extends readonly TransientPropSpec[]
    ? number extends Transient['length']
      ? never
      : Nested extends readonly NestedEditorSpec[]
        ? number extends Nested['length']
          ? never
          : CardMenuDataset<Base, Transient, Nested>
        : never
    : never

/**
 * The `queryParams` key vocabulary: typed `/card param` values are strings
 * merged into the insert dataset, so an entry may only name keys whose
 * dataset value is a string. An explicitly open dataset (`Record<string,
 * unknown>`, e.g. a wide-annotated host spec) keeps the loose `string`; a
 * precise dataset narrows to its string-valued keys (Image's `src`,
 * Bookmark's `url`), and the `never` sentinel of an un-parameterized
 * declaration accepts no key at all.
 */
export type CardMenuQueryParamKey<Dataset> = [Dataset] extends [never]
  ? never
  : string extends keyof Dataset
    ? string
    : {
        [K in Extract<keyof Dataset, string>]-?: NonNullable<Dataset[K]> extends string ? K : never
      }[Extract<keyof Dataset, string>]

/**
 * One slash/plus menu entry, React-free: everything a `MenuItem`
 * (`@/inkling/nodes/cards/card-menu-build`) carries except the icon component and the command
 * object, which are named by id (`CardIconId` / `CardMenuCommand`) and
 * resolved one layer up instead. The derived view in
 * `@/inkling/nodes/cards/card-menus` resolves `icon` to the SVGR component and
 * `command` to the entry's `insertCommand`.
 *
 * The `Dataset` type parameter is the card's construction dataset (see
 * `CardMenuDataset`): `insertParams` is a partial dataset and `queryParams`
 * names string-valued dataset keys, so an invalid key or value is a compile
 * error at the declaration site.
 */
export interface CardMenuEntrySpec<Dataset extends Record<string, unknown> = Record<string, unknown>> {
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
  insertParams?: Partial<Dataset> | (() => Partial<Dataset>)
  matches?: string[]
  priority?: number
  shortcut?: string
  queryParams?: readonly CardMenuQueryParamKey<Dataset>[]
  isHidden?: (args: { config: CardConfig | undefined }) => boolean
}

/**
 * The card's upload-claiming key — one of the media keys of the host
 * uploader's `fileTypes` (`FileUploader` in
 * `@/inkling/context/InklingHostIntegrationContext`). `DragDropPastePlugin` looks the
 * key up to learn which mime types claim a drag/drop or paste insert for the
 * card's node type. Only the four media cards (Audio, File, Image, Video)
 * carry one.
 */
export type CardUploadType = keyof NonNullable<FileUploader['fileTypes']>

/**
 * How the card joins the markdown round-trip (`MARKDOWN_NODES` in
 * `@/inkling/markdown/round-trip`):
 *
 * - `{ kind: 'fence' }` — the card speaks a ` ```inkling:<card>``` ` fence.
 *   The per-card payload vocabulary (`getData`/`createNode`) attaches one
 *   layer up in `@/inkling/nodes/cards/card-markdown-transformers`, keyed
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
 * (`@/inkling/nodes/cards/card-menus`), the decorate renders
 * (`@/inkling/nodes/cards/card-decorate`), the wrapper node classes
 * (`@/inkling/nodes/cards/card-wrappers`), and the insert registrations
 * (`@/inkling/nodes/cards/card-insert-commands`). Adding a card means adding its
 * declaration here plus its per-card React module — nothing is
 * hand-maintained in two places.
 *
 * React-free: `baseNode` is imported from its deep `@/inkling/nodes/base/nodes/...`
 * path so `@/inkling/nodes/base` can derive its node set from the declarations
 * without pulling in the wrapper/component layer. The wrapper node class and
 * the React-bearing decorate/menu pieces attach one layer up — the
 * declarations must never import wrappers, or the base barrel would close an
 * import cycle through the wrapper files. Menu icons and component renders
 * are therefore named by id (`CardIconId`) or attached beside each card's
 * component in the `*NodeComponent` files.
 *
 * Declarations are written as `checkedCardDeclaration({ … } satisfies
 * CardDeclaration<'<nodeType>', typeof BaseNode, typeof transientProps,
 * typeof nestedEditors>)`: the inner `satisfies` keeps the literal node type
 * and contextual typing, the wrapper applies the function-return exact-key
 * check. Every current declaration spells `readonly []` for an absent spec
 * array; `CardMenuDataset` then derives the menu's payload/key vocabulary from
 * those same sources, so the menu cannot drift from the constructor's dataset.
 * Omitting the arguments is NOT an open fallback: `DeclaredCardMenuDataset`
 * resolves the defaults to `never`, so a menu-bearing declaration that forgets
 * them cannot use `insertParams`/`queryParams`. The broad existential shape is
 * `AnyCardDeclaration`; the real family is pinned by
 * `tests/inkling/typecheck/card-menu-params.ts`.
 */
export interface CardDeclaration<
  NodeType extends string = string,
  Base extends CardBaseNodeClass = CardBaseNodeClass,
  Transient extends readonly TransientPropSpec[] | undefined = readonly TransientPropSpec[],
  Nested extends readonly NestedEditorSpec[] | undefined = readonly NestedEditorSpec[],
> {
  nodeType: NodeType
  baseNode: Base
  /**
   * The card's nested editors (CONTEXT.md: "card spec"), for cards that keep
   * rich-text content in nested Lexical editors. The spec array lives in the
   * card's base node module (const-asserted there: the shim's `__*` field map
   * derives its keys from the literal names — `CardSpecFieldMap`), imported
   * here. The wrapper node class
   * adopts this as its static `nestedEditors`; the generated node machinery
   * (`@/inkling/nodes/base/generate-decorator-node`) drives constructor setup,
   * `getDataset` appends, and `exportJSON` re-serialization from it.
   */
  nestedEditors?: Nested
  /**
   * The card's transient props (CONTEXT.md: "card spec") — client-side-only
   * fields (upload flow state, edit-mode flags) read from the construction
   * dataset, initialized by the generated node machinery, and never
   * serialized. Housed in the base node module like `nestedEditors`. The
   * wrapper node class adopts this as its static
   * `transientProps`; see `TransientPropSpec` in
   * `@/inkling/nodes/base/card-specs`.
   */
  transientProps?: Transient
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
   * see `CardMenuEntrySpec`. A card with no menu entry (the footnote
   * definition — created/ordered by the footnote behaviour module, never
   * inserted by the user) omits this field.
   */
  menu?: readonly CardMenuEntrySpec<DeclaredCardMenuDataset<Base, Transient, Nested>>[]
  /**
   * The drag-preview icon, when the declaration overrides the default (the
   * first menu entry's icon — see `resolveCardDragIcon`). The footnote
   * definition names none (the doc-end-run invariant re-parks it).
   * See `getCardDragIcon` in `@/inkling/nodes/cards/card-menus`.
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
   * see `getCardToolbarLabel` in `@/inkling/nodes/cards/card-facts`). Most
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

/**
 * The existential declaration shape for the two broad test projections
 * (`tests/inkling/unit/nodes/card-declarations.test.ts` and
 * `tests/inkling/nodes-base/import-spec-classification.test.ts`): the same
 * declaration shape with the menu's dataset re-opened to
 * `Record<string, unknown>`. `CardDeclaration` itself keeps the checked
 * default (`DeclaredCardMenuDataset` → `never`), so a precise declaration is
 * not assignable here without this explicit alias — the broad seam must name
 * it instead of relying on a loose default.
 */
export type AnyCardDeclaration = Omit<CardDeclaration, 'menu'> & {
  menu?: readonly CardMenuEntrySpec[]
}

/**
 * The exact `insertParams` key check used by the declaration wrapper and
 * `defineCard` (internal; the shared entry points are `CardMenuEntryCheck`
 * and `CardDeclarationMenuDataset`): every key written must exist in the
 * construction dataset,
 * otherwise its value type is `never`. The function form is checked through
 * its return type because TypeScript does not excess-property-check object
 * literals returned from contextually typed arrows (a function-form typo
 * would otherwise compile at a `satisfies` declaration).
 *
 * Any input whose keys are already widened — a string index signature
 * (`Record<string, unknown>`), a pre-widened `insertParams`/`baseNode`, or an
 * explicitly wide-annotated spec — is an intentional erasure boundary: the
 * keys are unrecoverable, so it is accepted as-is. Inline object and function
 * literals keep their keys and are checked.
 */
type CardMenuExactInsertParams<InsertParams, Dataset> = InsertParams extends (...args: infer Args) => infer Result
  ? string extends keyof Result
    ? (...args: Args) => Result
    : (...args: Args) => { [K in keyof Result]: K extends keyof Dataset ? Result[K] : never }
  : string extends keyof InsertParams
    ? InsertParams
    : { [K in keyof InsertParams]: K extends keyof Dataset ? InsertParams[K] : never }

/**
 * A `queryParams` key check (internal): literal keys must name string-valued
 * dataset keys; the widened `string` element type (an explicit wide
 * annotation, or a `satisfies HostCardSpec` whose loose menu erased the
 * literal) is accepted — that erasure is the documented compatibility
 * boundary.
 */
type CardMenuQueryKeyCheck<Key, Dataset> = string extends Key
  ? Key
  : Key extends CardMenuQueryParamKey<Dataset>
    ? Key
    : never

type CheckedInsertParams<Entry, Dataset> = Entry extends { insertParams?: infer InsertParams }
  ? CardMenuExactInsertParams<NonNullable<InsertParams>, Dataset> | undefined
  : never

type CheckedQueryParams<Entry, Dataset> = Entry extends { queryParams?: infer QueryParams }
  ? NonNullable<QueryParams> extends readonly (infer Key)[]
    ? readonly CardMenuQueryKeyCheck<Key, Dataset>[] | undefined
    : never
  : never

/**
 * The per-entry exactness projection over a menu tuple. The `'…' extends
 * keyof …` guards matter when the helper is used independently: an entry
 * without `insertParams` must stay exactly as written, not acquire an
 * optional `{}`/`never` property.
 */
export type CardMenuEntryCheck<Menu, Dataset extends Record<string, unknown>> = {
  [I in keyof Menu]: Menu[I] extends object
    ? Omit<Menu[I], 'insertParams' | 'queryParams'> &
        ('insertParams' extends keyof Menu[I] ? { insertParams?: CheckedInsertParams<Menu[I], Dataset> } : unknown) &
        ('queryParams' extends keyof Menu[I] ? { queryParams?: CheckedQueryParams<Menu[I], Dataset> } : unknown)
    : Menu[I]
}

type DeclarationTransientProps<D> = D extends { transientProps?: infer T }
  ? NonNullable<T> extends readonly TransientPropSpec[]
    ? NonNullable<T>
    : readonly []
  : readonly []

type DeclarationNestedEditors<D> = D extends { nestedEditors?: infer N }
  ? NonNullable<N> extends readonly NestedEditorSpec[]
    ? NonNullable<N>
    : readonly []
  : readonly []

export type CardDeclarationMenuDataset<D> = D extends { baseNode: infer B extends CardBaseNodeClass }
  ? CardMenuDataset<B, DeclarationTransientProps<D>, DeclarationNestedEditors<D>>
  : never

type CardDeclarationMenuCheck<D> = D extends { menu?: infer Menu }
  ? Menu extends readonly unknown[]
    ? { menu?: CardMenuEntryCheck<Menu, CardDeclarationMenuDataset<D>> }
    : unknown
  : unknown

/**
 * The declaration-site wrapper: `satisfies CardDeclaration<'…', …>` keeps the
 * contextual typing and shape check, and this identity wrapper applies the
 * exact-key check over the declaration's INFERRED menu literal — closing the
 * one hole `satisfies` cannot see (a function-valued `insertParams` with a
 * typo'd return key). Declarations are written as
 * `checkedCardDeclaration({ … } satisfies CardDeclaration<…>)`.
 */
export function checkedCardDeclaration<const D extends { baseNode: CardBaseNodeClass }>(
  declaration: D & CardDeclarationMenuCheck<D>,
): D {
  return declaration
}
