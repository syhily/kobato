import type { EditorState, Klass, LexicalEditor, LexicalNode, LexicalNodeReplacement } from 'lexical'

import type { CleanBasicHtmlOptions } from '@/inkling/html/clean-basic-html'

import { fileOr } from '@/inkling/utils/value-guards'

// The card-spec vocabulary, a LEAF of the card pipeline: it never imports the
// class factory or a node class, so declarations, the assembler, and the
// derived views can read the spec DSL without pulling the factory.

/**
 * One declarative property of a generated card node. `name` and `default` drive
 * the dataset typing and seed the constructor. `urlType` marks a URL-bearing
 * property for the out-of-repo `urlTransformMap` consumer; `urlPath` remaps the
 * key used there. `wordCount` includes the property in the node's text content.
 * `invalidates` names the sibling properties an edit to this one clears.
 * `redactDataUrl` keeps an upload-in-progress `data:` value out of `exportJSON`.
 */
export interface DecoratorNodeProperty<Name extends string = string, Default = unknown> {
  name: Name
  default: Default
  // validateArguments keeps the runtime throw for untyped consumers
  urlType?: 'url' | 'html' | 'markdown'
  urlPath?: string
  wordCount?: boolean
  invalidates?: readonly string[]
  redactDataUrl?: boolean
}

/**
 * One nested editor of a card spec. Adopted per node class through the static
 * `nestedEditors` property, so a base node class stays editor-free while a
 * wrapper subclass turns the nested-editor behaviour on. `nodes` stay
 * React-free node-class arrays.
 */
export interface NestedEditorSpec {
  /** Dataset key for the editor instance; the node field is `__<name>` and the initial-state keys derive from it. */
  name: string
  /** The node's data property holding this editor's serialized HTML (e.g. `caption`). */
  serializedKey: string
  /** Node classes registered on the nested editor. */
  nodes: ReadonlyArray<Klass<LexicalNode> | LexicalNodeReplacement>
  /** `cleanBasicHtml` options used when re-serializing the editor on `exportJSON`. */
  cleanBasicHtml?: CleanBasicHtmlOptions
  /** Whether `getDataset` exposes the `<name>InitialState` key (default true). */
  exposeInitialStateInDataset?: boolean
  /**
   * Type-only: marks the editor field nullable (`LexicalEditor | null`) for the
   * cards the markdown round-trip detaches. The runtime never reads this flag;
   * it exists so the field TYPE stays honest.
   */
  nullable?: boolean
}

const NO_NESTED_EDITORS: readonly NestedEditorSpec[] = []

/**
 * Reads the nested-editor spec off the node's actual class, so a subclass
 * adopts its own spec via `static nestedEditors`.
 */
export function getNestedEditorSpecs(node: LexicalNode): readonly NestedEditorSpec[] {
  // node.constructor is typed Function; the optional-member binding (kept off
  // the weak-type path by the shared `name` member) reads the adopted static
  // without an assertion
  const klass: { name: string; nestedEditors?: readonly NestedEditorSpec[] } = node.constructor
  return klass.nestedEditors ?? NO_NESTED_EDITORS
}

/**
 * One transient prop of a card spec: a client-side-only field controlling node
 * behaviour (upload-flow state, edit-mode flags). Read from the construction
 * dataset, never serialized to JSON, and re-exposed in `getDataset` only when
 * the spec names a `datasetKey`.
 */
export interface TransientPropSpec {
  /** The construction-dataset key the initial value is read from (e.g. `triggerFileDialog`, `_openInEditMode`). */
  name: string
  /** The node's private field; defaults to `__${name}`. */
  privateName?: string
  /** Computes the field's initial value from the construction dataset (defaults to `dataset[name]`). */
  initial?: (dataset: Record<string, unknown>) => unknown
  /** Key under which `getDataset` re-exposes the current field value, if any. */
  datasetKey?: string
  /** Generate the get/set accessor pair (reading/writing the private field) on the assembled class. */
  accessor?: boolean
}

/**
 * The shared `triggerFileDialog` spec entry (the four upload cards'): the
 * insert-time "open the file picker" flag — do not trigger the dialog when
 * rendering a card constructed with a url. Const-asserted so the literal `name`
 * and value type survive into `CardSpecFieldMap`/`CardSpecAccessorMap`.
 */
export const transientTriggerFileDialogProp = {
  name: 'triggerFileDialog',
  initial: (dataset: Record<string, unknown>): boolean => Boolean(!dataset.src && dataset.triggerFileDialog),
  accessor: true,
} as const satisfies TransientPropSpec

/**
 * The shared `initialFile` spec entry (the four upload cards'): the File a
 * drag+drop/paste insert hands the card so its upload starts on mount.
 */
export const transientInitialFileProp = {
  name: 'initialFile',
  initial: (dataset: Record<string, unknown>): File | undefined => fileOr(dataset.initialFile, undefined),
} as const satisfies TransientPropSpec

const NO_TRANSIENT_PROPS: readonly TransientPropSpec[] = []

/**
 * Reads the transient-prop spec off the node's actual class, so a subclass
 * adopts its own spec via `static transientProps`.
 */
export function getTransientPropSpecs(node: LexicalNode): readonly TransientPropSpec[] {
  // same optional-member binding idiom as getNestedEditorSpecs above
  const klass: { name: string; transientProps?: readonly TransientPropSpec[] } = node.constructor
  return klass.transientProps ?? NO_TRANSIENT_PROPS
}

export function getTransientPropPrivateName(spec: TransientPropSpec): string {
  return spec.privateName ?? `__${spec.name}`
}

/**
 * Type-level twin of `getTransientPropPrivateName`. Only literal when the spec
 * array was const-asserted, as every base node module keeps it.
 */
export type TransientPropFieldName<Spec extends TransientPropSpec> = Spec extends {
  privateName: infer Name extends string
}
  ? Name
  : `__${Spec['name']}`

/**
 * The private field names one nested-editor spec entry drives: the editor
 * instance field `__<name>` and its `__<name>InitialState` companion, which
 * exists regardless of `exposeInitialStateInDataset`.
 */
export type NestedEditorFieldNames<Spec extends NestedEditorSpec> =
  | `__${Spec['name']}`
  | `__${Spec['name']}InitialState`

/**
 * Every `__*` field name a card declaration's spec drives. Reads the spec
 * arrays off the declaration's own type, so the arrays must stay const-asserted
 * for the literal names to survive. A spec-less declaration yields `never`.
 */
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

/**
 * The value type one transient-prop spec entry carries: the annotated return
 * type of its `initial` lambda. An entry without `initial` derives `unknown`
 * (host specs stay loose).
 */
export type TransientPropValue<Spec> = Spec extends {
  initial: (dataset: Record<string, unknown>) => infer Value
}
  ? Value
  : unknown

/**
 * The value type one nested-editor spec entry carries: `LexicalEditor | null`
 * when the entry sets `nullable: true`, else a non-null `LexicalEditor`.
 */
export type NestedEditorValue<Spec> = Spec extends { nullable: true } ? LexicalEditor | null : LexicalEditor

/**
 * The transient-prop `__*` field map of ONE spec array, consumed directly by
 * base node modules to self-type their spec-driven fields by interface merging.
 */
export type TransientPropFieldMap<Specs extends readonly TransientPropSpec[]> = {
  [Spec in Specs[number] as TransientPropFieldName<Spec>]: TransientPropValue<Spec>
}

/**
 * The nested-editor `__*` field map of ONE spec array: the editor instance
 * field `__<name>` plus its `__<name>InitialState` companion.
 */
export type NestedEditorFieldMap<Specs extends readonly NestedEditorSpec[]> = {
  [Spec in Specs[number] as `__${Spec['name']}`]: NestedEditorValue<Spec>
} & {
  [Spec in Specs[number] as `__${Spec['name']}InitialState`]: EditorState | undefined
}

/**
 * The accessor map of ONE transient-prop spec array: one read/write property
 * per entry marked `accessor: true`. The runtime pair is defined on the
 * assembled class (`assembleCardNode`), so a base node without its spec has no
 * accessor at runtime.
 */
export type TransientPropAccessorMap<Specs extends readonly TransientPropSpec[]> = {
  [Spec in Specs[number] as Spec extends { accessor: true } ? Spec['name'] : never]: TransientPropValue<Spec>
}

/**
 * The spec-driven instance vocabulary of a base node class, DERIVED from the
 * spec arrays the base module owns: the transient/nested-editor `__*` fields
 * plus the transient accessors. Consumed by interface merging:
 *
 * ```ts
 * export interface BaseAudioNode extends CardSpecFieldMapFor<typeof audioTransientProps> {}
 * ```
 *
 * The maps only resolve to statically known members when the spec arrays are
 * const-asserted, as every base module keeps them.
 */
export type CardSpecFieldMapFor<
  Transient extends readonly TransientPropSpec[],
  Nested extends readonly NestedEditorSpec[] = readonly [],
> = TransientPropFieldMap<Transient> & TransientPropAccessorMap<Transient> & NestedEditorFieldMap<Nested>

/**
 * The `__*` type map of a card node, DERIVED from its declaration's spec: the
 * spec is the single source of the whole transient/nested-editor field
 * vocabulary, so renaming or retyping an entry is a compile error at every
 * consumer. The base classes self-type the same vocabulary via
 * `CardSpecFieldMapFor` over the spec arrays their module owns.
 *
 * The spec properties are matched OPTIONALLY on purpose: a host card's
 * preserved spec type carries `transientProps?`/`nestedEditors?`, and the maps
 * must still resolve from the inferred arrays. An absent or non-array property
 * contributes nothing.
 */
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

/**
 * The accessor map of a card node, DERIVED the same way as `CardSpecFieldMap`;
 * see `TransientPropAccessorMap`.
 */
export type CardSpecAccessorMap<D> = D extends { transientProps?: infer Specs }
  ? NonNullable<Specs> extends readonly TransientPropSpec[]
    ? TransientPropAccessorMap<NonNullable<Specs>>
    : unknown
  : unknown

/**
 * The construction-dataset entries one transient-prop spec array drives: one
 * optional key per entry at its `name`, typed as the non-null half of the
 * field's value type. Keeps a card's insert-command payload and public dataset
 * from drifting from the spec.
 */
export type CardSpecTransientDataset<Specs extends readonly TransientPropSpec[]> = {
  [Spec in Specs[number] as Spec['name']]?: NonNullable<TransientPropValue<Spec>>
}

/**
 * The construction-dataset entries one nested-editor spec array drives: one
 * optional `<name>` / `<name>InitialState` pair per entry. The pair is
 * unconditional for clone/getDataset symmetry, even when
 * `exposeInitialStateInDataset: false` keeps it out of `getDataset`.
 */
export type CardSpecNestedEditorDataset<Specs extends readonly NestedEditorSpec[]> = {
  [Spec in Specs[number] as Spec['name']]?: LexicalEditor
} & {
  [Spec in Specs[number] as `${Spec['name']}InitialState`]?: EditorState
}
