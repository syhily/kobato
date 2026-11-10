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
 * A generateDecoratorNode product. Projections widen to `Klass<LexicalNode>`, but the
 * generated statics exist on every built-in and host class, so they type without
 * casting through `unknown`.
 */
export type CardBaseNodeClass = Klass<LexicalNode> & {
  getPropertyDefaults(): Record<string, unknown>
  readonly importSpec?: CardImportSpec
  readonly urlTransformMap: Record<string, string | Record<string, string>>
}

/**
 * The card's decorate-target wrapper props — the React-free half of what `decorate()`
 * passes to `InklingCardWrapper`; renders and icons attach one layer up in the
 * `*NodeComponent` files. `width` may be a node→width mapper for cards whose width is
 * runtime node state (Image/Video read `cardWidth`; Header maps its `layout`).
 */
export interface DecorateTargetSpec {
  width?: CardWidth | ((node: LexicalNode) => CardWidth | undefined)
  wrapperStyle?: string
  hasIndicatorIcon?: boolean
}

/**
 * The card's membership in the insert-command surface; the presence of `insert` is the
 * opt-in. The command derives from the node type via `resolveCardInsertCommand`, so it
 * cannot drift from the card. React-free; the registrar
 * (`@/inkling/plugins/CardInsertPlugin`) is the derived view.
 */
export interface CardInsertSpec {
  /** dispatch INSERT_CARD_COMMAND with openInEditMode: true after construction */
  openInEditMode?: boolean
  /** claim INSERT_MEDIA_COMMAND payloads whose type equals this card's nodeType */
  claimsMediaInsert?: boolean
  /** bookmark only — redundant with INSERT_CARD_COMMAND's own selection handling, but observable in dispatch return values */
  requiresRangeSelection?: boolean
  /** bookmark only — HIGH priority; every other card is LOW */
  insertCommandPriority?: 'high'
}

/**
 * Card menu icon ids. Naming the icon by id keeps declarations React-free; the SVGR
 * components attach one layer up in `@/inkling/nodes/cards/card-menus`.
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
 * The command a menu entry dispatches, named rather than referenced so `card-commands`
 * stays a derived view over the declarations. `'insert'` names the entry's own card
 * insert command (derived from the declaration's node type); the two extras are the
 * Image card's selector commands.
 */
export type CardMenuCommand = 'insert' | 'openGifSelector' | 'openImageLibrary'

/**
 * The construction-dataset vocabulary a menu entry may name: `insertParams`' payload
 * and `queryParams`' keys. Derived from the base class's `getPropertyDefaults()` plus
 * the spec arrays, so a menu entry cannot name a key the constructor silently ignores.
 * A declaration must pass its base class and spec array types to get the precise
 * dataset; `DeclaredCardMenuDataset` turns un-parameterized defaults into `never`
 * (host specs use `HostCardMenuEntrySpec`, never this default).
 */
export type CardMenuDataset<
  Base extends CardBaseNodeClass,
  Transient extends readonly TransientPropSpec[] | undefined = readonly TransientPropSpec[],
  Nested extends readonly NestedEditorSpec[] | undefined = readonly NestedEditorSpec[],
> = Partial<ReturnType<Base['getPropertyDefaults']>> &
  CardMenuTransientDataset<Transient> &
  CardMenuNestedEditorDataset<Nested>

// A broad spec array (the un-parameterized default) cannot name literal dataset keys,
// so it degrades to the open record; a const-asserted tuple stays precise.
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
 * The dataset a DECLARATION's menu is checked against: the un-parameterized
 * `CardDeclaration` defaults resolve to `never`, so a menu-bearing declaration that
 * forgets its type arguments cannot use `insertParams`/`queryParams`, while
 * `readonly []` (or a const-asserted array) gets the precise `CardMenuDataset`.
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
 * The `queryParams` key vocabulary: `/card param` values merge into the insert dataset
 * as strings, so an entry may only name string-valued dataset keys. An explicitly open
 * dataset keeps the loose `string`; the `never` sentinel accepts no key.
 */
export type CardMenuQueryParamKey<Dataset> = [Dataset] extends [never]
  ? never
  : string extends keyof Dataset
    ? string
    : {
        [K in Extract<keyof Dataset, string>]-?: NonNullable<Dataset[K]> extends string ? K : never
      }[Extract<keyof Dataset, string>]

/**
 * One slash/plus menu entry, React-free: everything a `MenuItem` carries except the
 * icon component and command object, which are named by id (`CardIconId` /
 * `CardMenuCommand`) and resolved in `card-menus`. `Dataset` is the card's
 * construction dataset (see `CardMenuDataset`), so an invalid `insertParams` key/value
 * is a compile error at the declaration site.
 */
export interface CardMenuEntrySpec<Dataset extends Record<string, unknown> = Record<string, unknown>> {
  label: string
  /** labels-table stem resolved at menu-build time (`menu.${labelKey}.label` / `.desc`); English `label`/`desc` stay the defaults */
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
 * The card's upload-claiming key — one of the media keys of the host uploader's
 * `fileTypes`, which `DragDropPastePlugin` looks up to claim a drag/drop or paste
 * insert. Only the four media cards carry one.
 */
export type CardUploadType = keyof NonNullable<FileUploader['fileTypes']>

/**
 * How the card joins the markdown round-trip (`MARKDOWN_NODES` in
 * `@/inkling/markdown/round-trip`):
 *
 * - `{ kind: 'fence' }` — the card speaks a ` ```inkling:<card>``` ` fence; the payload
 *   vocabulary lives in `card-markdown-transformers`, and its `createNode` must
 *   construct the wrapper node class the round-trip editor registers (which the
 *   React-free declaration modules must never import).
 * - `{ kind: 'exempt' }` — markdown-eligible with no card fence: CodeBlock and
 *   HorizontalRule use the dialect's own transformers (`CODE_FENCE` / `HR`), Image uses
 *   standard `![alt](src)`.
 *
 * No entry (Header, Math, footnote definition): the card sits out the round-trip.
 */
export type CardMarkdownSpec = { kind: 'fence' } | { kind: 'exempt' }

/**
 * The single per-card source of truth. Every card registry (menus, decorate renders,
 * wrapper node classes, insert registrations) is a derived view over these
 * declarations.
 *
 * React-free: `baseNode` is imported from its deep `@/inkling/nodes/base/nodes/...`
 * path so the base barrel can derive its node set from the declarations without
 * pulling in the wrapper/component layer. Declarations must never import wrappers —
 * the base barrel would close an import cycle through the wrapper files.
 */
export interface CardDeclaration<
  NodeType extends string = string,
  Base extends CardBaseNodeClass = CardBaseNodeClass,
  Transient extends readonly TransientPropSpec[] | undefined = readonly TransientPropSpec[],
  Nested extends readonly NestedEditorSpec[] | undefined = readonly NestedEditorSpec[],
> {
  nodeType: NodeType
  baseNode: Base
  /** The card's nested editors; spec array lives const-asserted in the base node module and is adopted as the static `nestedEditors`. */
  nestedEditors?: Nested
  /** The card's transient props — client-only construction-dataset fields, never serialized; adopted as the static `transientProps`. */
  transientProps?: Transient
  /** The card's decorate-target wrapper props; see `DecorateTargetSpec`. */
  decorateTarget?: DecorateTargetSpec
  /** The card's insert-command registration; see `CardInsertSpec`. */
  insert?: CardInsertSpec
  /** The card's slash/plus menu entries; see `CardMenuEntrySpec`. */
  menu?: readonly CardMenuEntrySpec<DeclaredCardMenuDataset<Base, Transient, Nested>>[]
  /**
   * The drag-preview icon, when the declaration overrides the default (the first
   * menu entry's icon — see `resolveCardDragIcon`).
   */
  dragIcon?: CardIconId
  /** The card's upload-claiming key — see `CardUploadType`. */
  uploadType?: CardUploadType
  /**
   * The `data-inkling-card-toolbar` value `CardActionToolbar` renders — a live
   * CSS/e2e selector contract, resolved by the node's own type so it cannot drift.
   * CodeBlock ("code-block") and File ("file-upload") diverge deliberately.
   */
  toolbarLabel: string
  /** The card's markdown round-trip eligibility; see `CardMarkdownSpec`. */
  markdown?: CardMarkdownSpec
}

/**
 * The existential declaration shape for broad test projections: the menu's dataset
 * re-opened to `Record<string, unknown>`.
 */
export type AnyCardDeclaration = Omit<CardDeclaration, 'menu'> & {
  menu?: readonly CardMenuEntrySpec[]
}

/**
 * The exact `insertParams` key check shared by `checkedCardDeclaration` and
 * `defineCard`: every written key must exist in the construction dataset, else its
 * value type is `never`. Function forms are checked through their return type —
 * TypeScript does not excess-property-check object literals returned from
 * contextually typed arrows. Already-widened inputs (a string index signature, a
 * pre-widened `insertParams`/`baseNode`) are intentional erasure boundaries and are
 * accepted as-is.
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
 * dataset keys; a widened `string` element type is the accepted erasure boundary.
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
 * Per-entry exactness projection over a menu tuple. The `'…' extends keyof …` guards
 * keep an entry without `insertParams`/`queryParams` exactly as written rather than
 * acquiring an optional `never` property.
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
 * Declaration-site wrapper: `satisfies` keeps contextual typing and shape checking;
 * this identity wrapper adds the exact-key check over the INFERRED menu literal —
 * closing the hole `satisfies` cannot see (a function-valued `insertParams` with a
 * typo'd return key).
 */
export function checkedCardDeclaration<const D extends { baseNode: CardBaseNodeClass }>(
  declaration: D & CardDeclarationMenuCheck<D>,
): D {
  return declaration
}
