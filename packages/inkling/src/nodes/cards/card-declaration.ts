import type { CardConfig, FileUploader } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import type {
  CardSpecNestedEditorDataset,
  CardSpecTransientDataset,
  NestedEditorSpec,
  TransientPropSpec,
} from '@kobato/inkling-internal/nodes/base/card-specs'
import type { CardImportSpec } from '@kobato/inkling-internal/nodes/base/import-spec'
import type { CardWidth } from '@kobato/inkling-internal/nodes/base/utils/card-widths'
import type { Klass, LexicalNode } from 'lexical'

export type CardBaseNodeClass = Klass<LexicalNode> & {
  getPropertyDefaults(): Record<string, unknown>
  readonly importSpec?: CardImportSpec
  readonly urlTransformMap: Record<string, string | Record<string, string>>
}

export interface DecorateTargetSpec {
  width?: CardWidth | ((node: LexicalNode) => CardWidth | undefined)
  wrapperStyle?: string
  hasIndicatorIcon?: boolean
}
export interface CardInsertSpec {
  openInEditMode?: boolean

  claimsMediaInsert?: boolean

  requiresRangeSelection?: boolean

  insertCommandPriority?: 'high'
}
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

export type CardMenuCommand = 'insert' | 'openGifSelector' | 'openImageLibrary'

export type CardMenuDataset<
  Base extends CardBaseNodeClass,
  Transient extends readonly TransientPropSpec[] | undefined = readonly TransientPropSpec[],
  Nested extends readonly NestedEditorSpec[] | undefined = readonly NestedEditorSpec[],
> = Partial<ReturnType<Base['getPropertyDefaults']>> &
  CardMenuTransientDataset<Transient> &
  CardMenuNestedEditorDataset<Nested>

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
export type CardMenuQueryParamKey<Dataset> = [Dataset] extends [never]
  ? never
  : string extends keyof Dataset
    ? string
    : {
        [K in Extract<keyof Dataset, string>]-?: NonNullable<Dataset[K]> extends string ? K : never
      }[Extract<keyof Dataset, string>]

export interface CardMenuEntrySpec<Dataset extends Record<string, unknown> = Record<string, unknown>> {
  label: string

  labelKey: string
  desc?: string
  icon: CardIconId
  command: CardMenuCommand
  insertParams?: Partial<Dataset> | (() => Partial<Dataset>)
  matches?: string[]
  priority?: number
  shortcut?: string
  queryParams?: readonly CardMenuQueryParamKey<Dataset>[]
  isHidden?: (args: { config: CardConfig | undefined }) => boolean
}

export type CardUploadType = keyof NonNullable<FileUploader['fileTypes']>

export type CardMarkdownSpec = { kind: 'fence' } | { kind: 'exempt' }

export interface CardDeclaration<
  NodeType extends string = string,
  Base extends CardBaseNodeClass = CardBaseNodeClass,
  Transient extends readonly TransientPropSpec[] | undefined = readonly TransientPropSpec[],
  Nested extends readonly NestedEditorSpec[] | undefined = readonly NestedEditorSpec[],
> {
  nodeType: NodeType
  baseNode: Base

  nestedEditors?: Nested

  transientProps?: Transient

  decorateTarget?: DecorateTargetSpec

  insert?: CardInsertSpec
  menu?: readonly CardMenuEntrySpec<DeclaredCardMenuDataset<Base, Transient, Nested>>[]
  dragIcon?: CardIconId
  uploadType?: CardUploadType

  toolbarLabel: string
  markdown?: CardMarkdownSpec
}

export type AnyCardDeclaration = Omit<CardDeclaration, 'menu'> & {
  menu?: readonly CardMenuEntrySpec[]
}

type CardMenuExactInsertParams<InsertParams, Dataset> = InsertParams extends (...args: infer Args) => infer Result
  ? string extends keyof Result
    ? (...args: Args) => Result
    : (...args: Args) => { [K in keyof Result]: K extends keyof Dataset ? Result[K] : never }
  : string extends keyof InsertParams
    ? InsertParams
    : { [K in keyof InsertParams]: K extends keyof Dataset ? InsertParams[K] : never }
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
export function checkedCardDeclaration<const D extends { baseNode: CardBaseNodeClass }>(
  declaration: D & CardDeclarationMenuCheck<D>,
): D {
  return declaration
}
