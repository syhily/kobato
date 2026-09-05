import type { EditorState, Klass, LexicalEditor, LexicalNode, LexicalNodeReplacement } from 'lexical'

import type { CleanBasicHtmlOptions } from '@/html/clean-basic-html'

import { fileOr } from '@/utils/value-guards'

// The card-spec vocabulary (CONTEXT.md: "card spec"), split out of the class
// factory so the dependency runs one way only: generate-decorator-node →
// card-specs. This module is a LEAF of the card pipeline — it never imports
// the factory (or any node class), so declarations, the assembler, and the
// derived views can all read the spec DSL without pulling the class factory.

/**
 * One declarative property of a generated card node. `name` and `default`
 * drive the dataset typing (via `DecoratorNodeValueMap`); `default` also
 * seeds the constructor and `getPropertyDefaults`. `urlType` marks the
 * property as URL-bearing — 'url' when it holds only a URL, 'html' or
 * 'markdown' when its content may contain URLs — for the out-of-repo
 * `urlTransformMap` consumer, and `urlPath` remaps the key used there.
 * `wordCount` includes the property in the node's text content.
 * `invalidates` names the sibling properties (the artifact slots,
 * CONTEXT.md "artifact slot") an edit to this property clears — the
 * edit-invalidates invariant the generated setter enforces. `redactDataUrl`
 * marks a src property whose upload-in-progress `data:` value must not be
 * persisted (exportJSON writes `'<base64String>'` instead).
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
 * One nested editor of a card spec (CONTEXT.md: "card spec"). Each entry
 * drives the full nested-editor trilogy on the generated node:
 *
 * - constructor: `setupNestedEditor` creates (or adopts a passed-in) editor
 *   instance on `__<name>`, and `populateNestedEditor` fills it from the
 *   `serializedKey` property's HTML when no editor instance was passed.
 * - `getDataset`: appends the client-side `<name>` key, plus the
 *   `<name>InitialState` key unless the spec sets
 *   `exposeInitialStateInDataset: false` (Header exposes the editors but not
 *   their initial states).
 * - `exportJSON`: re-serializes the editor's content back into the
 *   `serializedKey` property via `$generateHtmlFromNodes` + `cleanBasicHtml`
 *   (the editor's content may not be reflected in the data property).
 *
 * The spec is adopted per node class through the static `nestedEditors`
 * property, so a base node class stays editor-free while a wrapper subclass
 * turns the trilogy on. `nodes` are Lexical node-class arrays — the spec
 * stays React-free.
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
}

// type-level brand key for the nested-editor value carrier below — never
// assigned at runtime, so a `declare`d unique symbol keeps it off every
// object shape while staying derivable in type space. Exported so inferred
// entry types can name it through declaration bundling; the `declare` emits
// no runtime binding
export declare const nestedEditorValueType: unique symbol

/**
 * The type-level carrier recording one nested-editor entry's `__<name>`
 * field value type: `LexicalEditor` for an editor that lives for the node's
 * whole lifetime, `LexicalEditor | null` for one the markdown round-trip
 * detaches (`$detachNestedEditorsForRoundTrip` nulls every spec-declared
 * editor on a fence-imported card) or the export path drops. Carried as a
 * branded property because a spec entry's inferred type is the only channel
 * `CardSpecFieldMap` can derive from — a `satisfies` target's type arguments
 * never reach it.
 */
export interface NestedEditorValueCarrier<TEditor extends LexicalEditor | null> {
  readonly [nestedEditorValueType]: TEditor
}

/**
 * Builds a nested-editor spec entry whose editor field is nullable (see
 * NestedEditorValueCarrier): the markdown round-trip / headless export paths
 * detach it. Entries built as plain literals default to a non-null
 * `LexicalEditor` field. Runtime-identical to the literal — the brand is
 * type-space only.
 */
export function nullableNestedEditor<const TName extends string>(
  spec: Omit<NestedEditorSpec, 'name'> & { name: TName },
): NestedEditorSpec & { name: TName } & NestedEditorValueCarrier<LexicalEditor | null> {
  return spec as NestedEditorSpec & { name: TName } & NestedEditorValueCarrier<LexicalEditor | null>
}

const NO_NESTED_EDITORS: readonly NestedEditorSpec[] = []

/**
 * Reads the nested-editor spec off the node's actual class, so a subclass
 * adopts its own spec via `static nestedEditors` while the generated base
 * class (and spec-less subclasses) run no nested-editor behaviour.
 */
export function getNestedEditorSpecs(node: LexicalNode): readonly NestedEditorSpec[] {
  return (node.constructor as { nestedEditors?: readonly NestedEditorSpec[] }).nestedEditors ?? NO_NESTED_EDITORS
}

/**
 * One transient prop of a card spec (CONTEXT.md: "card spec") — a
 * client-side-only field that controls node behaviour (upload flow state
 * like `triggerFileDialog`/`initialFile`/`previewSrc`, or CodeBlock's
 * `_openInEditMode` edit-mode flag). Transient props are read from the
 * construction dataset, are never serialized to JSON, and are exposed in
 * `getDataset` only when the spec names a `datasetKey` (Image exposes
 * `__previewSrc`/`__triggerFileDialog`; its datasets flow through the
 * drag-and-drop payload path).
 *
 * The spec is adopted per node class through the static `transientProps`
 * property, so a base node class stays free of upload-flow state while a
 * wrapper subclass turns the props on — the generated constructor
 * initializes each `__<name>` field from the dataset it receives.
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
 * insert-time "open the file picker" flag — don't trigger the dialog when
 * rendering if the card was constructed with a url — with its accessor
 * generated. Const-asserted so the literal `name` and value type survive
 * into `CardSpecFieldMap`/`CardSpecAccessorMap`; image spreads it to add
 * its `datasetKey`.
 */
export const transientTriggerFileDialogProp = {
  name: 'triggerFileDialog',
  initial: (dataset: Record<string, unknown>): boolean => Boolean(!dataset.src && dataset.triggerFileDialog),
  accessor: true,
} as const satisfies TransientPropSpec

/**
 * The shared `initialFile` spec entry (the four upload cards'): the File a
 * drag+drop/paste insert hands the card through INSERT_MEDIA_COMMAND so its
 * upload starts on mount. Const-asserted like
 * `transientTriggerFileDialogProp` so the literal `name` and value type
 * survive into `CardSpecFieldMap` — one value type (`File | undefined`) for
 * all four cards; video's former `File | null` divergence was drift, not
 * behaviour.
 */
export const transientInitialFileProp = {
  name: 'initialFile',
  initial: (dataset: Record<string, unknown>): File | undefined => fileOr(dataset.initialFile, undefined),
} as const satisfies TransientPropSpec

const NO_TRANSIENT_PROPS: readonly TransientPropSpec[] = []

/**
 * Reads the transient-prop spec off the node's actual class, so a subclass
 * adopts its own spec via `static transientProps` while the generated base
 * class (and spec-less subclasses) run no transient-prop behaviour.
 */
export function getTransientPropSpecs(node: LexicalNode): readonly TransientPropSpec[] {
  return (node.constructor as { transientProps?: readonly TransientPropSpec[] }).transientProps ?? NO_TRANSIENT_PROPS
}

export function getTransientPropPrivateName(spec: TransientPropSpec): string {
  return spec.privateName ?? `__${spec.name}`
}

/**
 * The node's private field name for one transient-prop spec entry (the
 * `privateName` remap when present, else `__${name}`) — the type-level twin
 * of `getTransientPropPrivateName` above. Only literal when the spec array
 * was const-asserted (`as const satisfies readonly TransientPropSpec[]`), as
 * every card declaration does.
 */
export type TransientPropFieldName<Spec extends TransientPropSpec> = Spec extends {
  privateName: infer Name extends string
}
  ? Name
  : `__${Spec['name']}`

/**
 * The private field names one nested-editor spec entry drives: the editor
 * instance field `__<name>` and its `__<name>InitialState` companion (set
 * when the editor is populated from its serialized HTML — the pair exists on
 * the node regardless of `exposeInitialStateInDataset`, which only gates the
 * `getDataset` key).
 */
export type NestedEditorFieldNames<Spec extends NestedEditorSpec> =
  | `__${Spec['name']}`
  | `__${Spec['name']}InitialState`

/**
 * Every `__*` field name a card declaration's spec (CONTEXT.md: "card spec")
 * drives — transient props and nested editors together. Reads the spec
 * arrays off the declaration's own type, so the declaration files must keep
 * their spec arrays const-asserted (`as const satisfies …`) for the literal
 * names to survive. A spec-less declaration yields `never`.
 */
export type CardSpecFieldNames<D> =
  | (D extends { transientProps: infer Specs extends readonly TransientPropSpec[] }
      ? TransientPropFieldName<Specs[number]>
      : never)
  | (D extends { nestedEditors: infer Specs extends readonly NestedEditorSpec[] }
      ? NestedEditorFieldNames<Specs[number]>
      : never)

/**
 * The value type one transient-prop spec entry carries: the annotated return
 * type of its `initial` lambda. Every declaration entry provides an
 * `initial` — an entry that wants the default `dataset[name]` read spells it
 * out with its value type — so the spec is the single source of both the
 * field NAME and the field TYPE. An entry without `initial` derives
 * `unknown` (host specs stay loose).
 */
export type TransientPropValue<Spec> = Spec extends {
  initial: (dataset: Record<string, unknown>) => infer Value
}
  ? Value
  : unknown

/**
 * The value type one nested-editor spec entry carries: the carrier's brand
 * (`nestedEditorSpec`) when present, else a non-null `LexicalEditor` — the
 * constructor's nested-editor setup always assigns an editor, and only the
 * round-trip-detached / export-dropped editors ride the carrier.
 */
export type NestedEditorValue<Spec> = Spec extends NestedEditorValueCarrier<infer Value> ? Value : LexicalEditor

/**
 * The `__*` type map of a card node, DERIVED from its declaration's spec
 * (CONTEXT.md: "card declaration"): keys come from the spec names, value
 * types from the entries' own type carriers (the transient `initial`
 * lambda's return type, the nested-editor `nestedEditorSpec` brand) — the
 * spec is the single source of the whole transient/nested-editor field
 * vocabulary, and renaming or retyping a spec entry is a compile error at
 * every consumer. The map rides the assembled class's instance type
 * (`assembleCardNodeOnce` folds it in), so the shims are re-exports only.
 * The base classes keep their hand-written `declare __*` fields (a base
 * cannot import its declaration — the declaration imports the base); that
 * leg is pinned by `test/typecheck/card-spec-field-agreement.ts` and the
 * runtime agreement test in `test/unit/nodes/card-declarations.test.ts`.
 */
export type CardSpecFieldMap<D> = (D extends { transientProps: infer Specs extends readonly TransientPropSpec[] }
  ? { [Spec in Specs[number] as TransientPropFieldName<Spec>]: TransientPropValue<Spec> }
  : unknown) &
  (D extends { nestedEditors: infer Specs extends readonly NestedEditorSpec[] }
    ? { [Spec in Specs[number] as `__${Spec['name']}`]: NestedEditorValue<Spec> } & {
        [Spec in Specs[number] as `__${Spec['name']}InitialState`]: EditorState | undefined
      }
    : unknown)

/**
 * The accessor map of a card node, DERIVED the same way as
 * `CardSpecFieldMap`: one read/write property per transient spec entry
 * marked `accessor: true`, at the entry's value type. The runtime pair is
 * defined on the assembled class (`assembleCardNode`), so a base node
 * without its declaration's spec has no accessor — matching the
 * spec-adoption lifecycle of the fields themselves.
 */
export type CardSpecAccessorMap<D> = D extends { transientProps: infer Specs extends readonly TransientPropSpec[] }
  ? { [Spec in Specs[number] as Spec extends { accessor: true } ? Spec['name'] : never]: TransientPropValue<Spec> }
  : unknown

/**
 * The construction-dataset entries one transient-prop spec array drives,
 * DERIVED from the same entries as `CardSpecFieldMap`: one optional key per
 * entry at its `name` (the dataset carries pre-init values, so the type is
 * the non-null half of the field's value type). Composed with the base node
 * module's `*Data` type this types the card's insert-command payload and
 * its public `*NodeDataset` (`card-commands.ts`), so the dataset's
 * transient vocabulary can no longer drift from the spec: renaming or
 * retyping a spec entry is a compile error at the command.
 */
export type CardSpecTransientDataset<Specs extends readonly TransientPropSpec[]> = {
  [Spec in Specs[number] as Spec['name']]?: NonNullable<TransientPropValue<Spec>>
}

/**
 * The construction-dataset entries one nested-editor spec array drives: one
 * optional `<name>` / `<name>InitialState` pair per entry. The pair is
 * unconditional because every card's dataset accepts the initial state for
 * clone/getDataset symmetry, even when `exposeInitialStateInDataset: false`
 * keeps it out of `getDataset`.
 */
export type CardSpecNestedEditorDataset<Specs extends readonly NestedEditorSpec[]> = {
  [Spec in Specs[number] as Spec['name']]?: LexicalEditor
} & {
  [Spec in Specs[number] as `${Spec['name']}InitialState`]?: EditorState
}
