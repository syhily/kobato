import type { CleanBasicHtmlOptions } from '@kobato/inkling-internal/html/clean-basic-html'
import type { EditorState, Klass, LexicalEditor, LexicalNode, LexicalNodeReplacement } from 'lexical'

import { fileOr } from '@kobato/inkling-internal/utils/value-guards'

export interface DecoratorNodeProperty<Name extends string = string, Default = unknown> {
  name: Name
  default: Default
  urlType?: 'url' | 'html' | 'markdown'
  urlPath?: string
  wordCount?: boolean
  invalidates?: readonly string[]
  redactDataUrl?: boolean
}

export interface NestedEditorSpec {
  name: string
  serializedKey: string
  nodes: ReadonlyArray<Klass<LexicalNode> | LexicalNodeReplacement>
  cleanBasicHtml?: CleanBasicHtmlOptions
  exposeInitialStateInDataset?: boolean
  nullable?: boolean
}

const NO_NESTED_EDITORS: readonly NestedEditorSpec[] = []

export function getNestedEditorSpecs(node: LexicalNode): readonly NestedEditorSpec[] {
  const klass: { name: string; nestedEditors?: readonly NestedEditorSpec[] } = node.constructor
  return klass.nestedEditors ?? NO_NESTED_EDITORS
}

export interface TransientPropSpec {
  name: string
  privateName?: string
  initial?: (dataset: Record<string, unknown>) => unknown
  datasetKey?: string
  accessor?: boolean
}

export const transientTriggerFileDialogProp = {
  name: 'triggerFileDialog',
  initial: (dataset: Record<string, unknown>): boolean => Boolean(!dataset.src && dataset.triggerFileDialog),
  accessor: true,
} as const satisfies TransientPropSpec

export const transientInitialFileProp = {
  name: 'initialFile',
  initial: (dataset: Record<string, unknown>): File | undefined => fileOr(dataset.initialFile, undefined),
} as const satisfies TransientPropSpec

const NO_TRANSIENT_PROPS: readonly TransientPropSpec[] = []

export function getTransientPropSpecs(node: LexicalNode): readonly TransientPropSpec[] {
  const klass: { name: string; transientProps?: readonly TransientPropSpec[] } = node.constructor
  return klass.transientProps ?? NO_TRANSIENT_PROPS
}

export function getTransientPropPrivateName(spec: TransientPropSpec): string {
  return spec.privateName ?? `__${spec.name}`
}

export type TransientPropFieldName<Spec extends TransientPropSpec> = Spec extends {
  privateName: infer Name extends string
}
  ? Name
  : `__${Spec['name']}`

export type NestedEditorFieldNames<Spec extends NestedEditorSpec> =
  | `__${Spec['name']}`
  | `__${Spec['name']}InitialState`

export type CardSpecFieldNames<D> =
  | (D extends { transientProps?: infer Specs }
      ? NonNullable<Specs> extends readonly TransientPropSpec[]
        ? TransientPropFieldName<NonNullable<Specs>[number]>
        : never
      : never)
  | (D extends { nestedEditors?: infer Specs }
      ? NonNullable<Specs> extends readonly NestedEditorSpec[]
        ? NestedEditorFieldNames<NonNullable<Specs>[number]>
        : never
      : never)

export type TransientPropValue<Spec> = Spec extends {
  initial: (dataset: Record<string, unknown>) => infer Value
}
  ? Value
  : unknown

export type NestedEditorValue<Spec> = Spec extends { nullable: true } ? LexicalEditor | null : LexicalEditor

export type TransientPropFieldMap<Specs extends readonly TransientPropSpec[]> = {
  [Spec in Specs[number] as TransientPropFieldName<Spec>]: TransientPropValue<Spec>
}

export type NestedEditorFieldMap<Specs extends readonly NestedEditorSpec[]> = {
  [Spec in Specs[number] as `__${Spec['name']}`]: NestedEditorValue<Spec>
} & {
  [Spec in Specs[number] as `__${Spec['name']}InitialState`]: EditorState | undefined
}

export type TransientPropAccessorMap<Specs extends readonly TransientPropSpec[]> = {
  [Spec in Specs[number] as Spec extends { accessor: true } ? Spec['name'] : never]: TransientPropValue<Spec>
}

export type CardSpecFieldMapFor<
  Transient extends readonly TransientPropSpec[],
  Nested extends readonly NestedEditorSpec[] = readonly [],
> = TransientPropFieldMap<Transient> & TransientPropAccessorMap<Transient> & NestedEditorFieldMap<Nested>

export type CardSpecFieldMap<D> = (D extends { transientProps?: infer Specs }
  ? NonNullable<Specs> extends readonly TransientPropSpec[]
    ? TransientPropFieldMap<NonNullable<Specs>>
    : unknown
  : unknown) &
  (D extends { nestedEditors?: infer Specs }
    ? NonNullable<Specs> extends readonly NestedEditorSpec[]
      ? NestedEditorFieldMap<NonNullable<Specs>>
      : unknown
    : unknown)

export type CardSpecAccessorMap<D> = D extends { transientProps?: infer Specs }
  ? NonNullable<Specs> extends readonly TransientPropSpec[]
    ? TransientPropAccessorMap<NonNullable<Specs>>
    : unknown
  : unknown

export type CardSpecTransientDataset<Specs extends readonly TransientPropSpec[]> = {
  [Spec in Specs[number] as Spec['name']]?: NonNullable<TransientPropValue<Spec>>
}

export type CardSpecNestedEditorDataset<Specs extends readonly NestedEditorSpec[]> = {
  [Spec in Specs[number] as Spec['name']]?: LexicalEditor
} & {
  [Spec in Specs[number] as `${Spec['name']}InitialState`]?: EditorState
}
