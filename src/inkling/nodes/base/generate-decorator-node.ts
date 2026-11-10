import type { DOMConversionMap, LexicalEditor, SerializedLexicalNode } from 'lexical'

import { $generateHtmlFromNodes } from '@lexical/html'
import { isLexicalEditor } from 'lexical'

import type { ExportDOMOptions, ExportDOMOutput } from '@/inkling/nodes/base/export-dom'
import type { RenderContext } from '@/inkling/nodes/base/render-context'

import { cleanBasicHtml } from '@/inkling/html/clean-basic-html'
import {
  getNestedEditorSpecs,
  getTransientPropPrivateName,
  getTransientPropSpecs,
  type DecoratorNodeProperty,
  type NestedEditorSpec,
  type TransientPropSpec,
} from '@/inkling/nodes/base/card-specs'
import { buildImportConversions, validateImportSpec, type CardImportSpec } from '@/inkling/nodes/base/import-spec'
import { InklingDecoratorNode } from '@/inkling/nodes/base/InklingDecoratorNode'
import { createRenderContext } from '@/inkling/nodes/base/render-context'
import readTextContent from '@/inkling/nodes/base/utils/read-text-content'
import { populateNestedEditor, setupNestedEditor } from '@/inkling/nodes/nested-editors'

// The render context is the ONLY export-time view a render fn receives besides
// the node. The node parameter is typed as the generated instance itself, so
// strict parameter contravariance rejects narrower fictions (e.g.
// `width: number` where the dataset is `number | null`).
type RenderFn<TNode, TOutput extends ExportDOMOutput = ExportDOMOutput> = (
  node: TNode,
  context: RenderContext,
) => TOutput
type WidenLiteral<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer U)[]
        ? U[]
        : T
/**
 * Every `invalidates` entry must name a property declared on the same node; an
 * unknown reference fails at class creation, otherwise the generated setter
 * would clear a field no property owns and leave the stale prerendered artifact
 * (Shiki's `highlightedHtml`, KaTeX's `mathml`/`svg`) in place after the edit.
 * Runtime validation because host cards and pre-widened arrays erase the
 * sibling literals a type-level check would need.
 */
function validateArguments(nodeType: string, properties: readonly DecoratorNodeProperty[]) {
  /* c8 ignore start */
  if (!nodeType) {
    throw new Error('[generateDecoratorNode] A unique "nodeType" should be provided')
  }

  const declaredNames = new Set(properties.map((prop) => prop.name))

  properties.forEach((prop: DecoratorNodeProperty) => {
    if (!('name' in prop) || !('default' in prop)) {
      throw new Error('[generateDecoratorNode] Properties should have both "name" and "default" attributes.')
    }

    if (prop.urlType && !['url', 'html', 'markdown'].includes(prop.urlType)) {
      throw new Error('[generateDecoratorNode] "urlType" should be either "url", "html" or "markdown"')
    }

    if ('wordCount' in prop && typeof prop.wordCount !== 'boolean') {
      throw new Error('[generateDecoratorNode] "wordCount" should be of boolean type.')
    }

    prop.invalidates?.forEach((reference) => {
      if (!declaredNames.has(reference)) {
        throw new Error(
          `[generateDecoratorNode] ${nodeType}: property "${prop.name}" invalidates unknown property "${reference}" ` +
            `(declared properties: ${[...declaredNames].join(', ') || 'none'})`,
        )
      }
    })
  })
  /* c8 ignore stop */
}

/**
 * Only EDITS clear artifact slots: the constructor and importJSON assign the
 * private fields directly, so a host-filled artifact survives deserialization
 * and cloning.
 */
export function applyArtifactSlotInvalidation<K extends string>(
  changed: boolean,
  writable: Record<K, unknown>,
  slotPrivateNames: readonly K[],
): void {
  if (!changed) {
    return
  }
  // no cast at either call site: both the generated FieldCarrier (index
  // signature) and MathInlineNode (declared `__*` fields) are assignable
  for (const name of slotPrivateNames) {
    writable[name] = ''
  }
}

/** The blob guard: an upload-in-progress `data:` src must not be persisted. */
export function redactDataUrlValue<T>(value: T): T | '<base64String>' {
  return typeof value === 'string' && value.startsWith('data:') ? '<base64String>' : value
}

export type DecoratorNodeValueMap<Props extends readonly DecoratorNodeProperty[]> = {
  [Prop in Props[number] as Prop['name']]: WidenLiteral<Prop['default']>
}

export type DecoratorNodeData<Props extends readonly DecoratorNodeProperty[]> = Partial<DecoratorNodeValueMap<Props>>

type GeneratedDecoratorNodeInstance<
  TDataset extends Record<string, unknown>,
  TOutput extends ExportDOMOutput = ExportDOMOutput,
  TSerialized extends SerializedLexicalNode = SerializedGeneratedDecoratorNode<TDataset>,
> = {
  exportDOM(editor: LexicalEditor, options?: ExportDOMOptions): TOutput
} & GeneratedDecoratorNodeBase<TDataset, TSerialized> &
  TDataset &
  PrivateDatasetFields<TDataset>

/**
 * The node's private `__<name>` fields, derived from the declared dataset
 * properties: what closes the field seam, so `__`-prefixed reads are checked
 * against the card's declared vocabulary instead of an open index signature.
 * Transient-prop and nested-editor fields are per-class spec state, derived one
 * layer up via `CardSpecFieldMap`.
 */
type PrivateDatasetFields<TDataset extends Record<string, unknown>> = {
  [K in keyof TDataset as `__${string & K}`]: TDataset[K]
}

// An intersection rather than Lexical's `Spread` utility: `Spread` isn't provably
// assignable to `SerializedLexicalNode` for an unresolved generic. A dataset
// property colliding with `type`/`version` at an incompatible type produces
// `never` — keep such properties compatible (e.g. HeaderNode's `version: number`).
export type SerializedGeneratedDecoratorNode<TDataset extends Record<string, unknown> = Record<string, unknown>> =
  SerializedLexicalNode & TDataset

export interface GeneratedDecoratorNodeClass<
  TDataset extends Record<string, unknown>,
  TOutput extends ExportDOMOutput = ExportDOMOutput,
  TSerialized extends SerializedLexicalNode = SerializedGeneratedDecoratorNode<TDataset>,
> {
  new (
    data?: Partial<TDataset> | Record<string, unknown>,
    key?: string,
  ): GeneratedDecoratorNodeInstance<TDataset, TOutput, TSerialized>
  prototype: GeneratedDecoratorNodeInstance<TDataset, TOutput, TSerialized>
  getType(): string
  /** Polymorphic: the body constructs `new this(dataset, key)`, so cloning a card subclass yields that subclass. */
  clone<T extends GeneratedDecoratorNodeInstance<TDataset, TOutput, TSerialized>>(node: T): T
  transform(): null
  getPropertyDefaults(): TDataset
  readonly nestedEditors?: readonly NestedEditorSpec[]
  readonly transientProps?: readonly TransientPropSpec[]
  readonly urlTransformMap: Record<string, string | Record<string, string>>
  readonly importSpec: CardImportSpec | undefined
  importDOM(): DOMConversionMap | null
  importJSON(serializedNode: Record<string, unknown>): GeneratedDecoratorNodeInstance<TDataset, TOutput, TSerialized>
}

// Type-only view of the generated node's instance side. Extending
// InklingDecoratorNode keeps generated nodes LexicalNode-typed; this cannot be a
// merged declaration because the generated class is function-local and its
// dataset members depend on the function's type parameters.
//
// Deliberately no index signature: field reads resolve against the card's
// declared vocabulary. The function-local class keeps its own for dynamic
// spec-driven assignments and never reaches consumers.
export interface GeneratedDecoratorNodeBase<
  TDataset extends Record<string, unknown> = Record<string, unknown>,
  TSerialized extends SerializedLexicalNode = SerializedGeneratedDecoratorNode<TDataset>,
> extends InklingDecoratorNode {
  getDataset(): Record<string, unknown>
  appendNestedEditorDataset<T extends Record<string, unknown>>(dataset: T): T
  appendTransientDataset<T extends Record<string, unknown>>(dataset: T): T
  serializeNestedEditorHtml<T extends Record<string, unknown>>(json: T): T
  // closed on typed instances (SerializedLexicalNode & TDataset); the default
  // keeps the open bag for consumers holding a card without its concrete
  // dataset type. Cards that remap on export declare their own TSerialized.
  exportJSON(): TSerialized
  isInklingCard(): true
  hasEditMode(): boolean
}

// the generated accessors' `this`, typed once: the class keeps a dynamic
// index signature for its spec-driven fields
interface FieldCarrier {
  getLatest(): Record<string, unknown>
  getWritable(): Record<string, unknown>
}

/**
 * One get/set accessor pair over a private field, shared by the generated
 * dataset-property accessors and the transient-prop accessors the assembler
 * stamps on the assembled class. `onWrite` runs edit-time side effects before
 * the write.
 */
export function defineFieldAccessor(
  prototype: object,
  name: string,
  privateName: string,
  onWrite?: (writable: Record<string, unknown>, newVal: unknown) => void,
): void {
  Object.defineProperty(prototype, name, {
    get: function (this: FieldCarrier) {
      return this.getLatest()[privateName]
    },
    set: function (this: FieldCarrier, newVal: unknown) {
      const writable = this.getWritable()
      onWrite?.(writable, newVal)
      writable[privateName] = newVal
    },
  })
}

export function generateDecoratorNode<
  Props extends readonly DecoratorNodeProperty[] = readonly [],
  TSerialized extends SerializedLexicalNode = SerializedGeneratedDecoratorNode<DecoratorNodeValueMap<Props>>,
  TOutput extends ExportDOMOutput = ExportDOMOutput,
>({
  nodeType,
  properties,
  defaultRenderFn,
  version = 1,
  importSpec,
  hasEditMode = true,
}: {
  nodeType: string
  properties?: Props
  // The render fn's declared node type must accept the generated instance, so
  // every key it reads exists on the dataset at its true (widened) type.
  defaultRenderFn?: RenderFn<
    GeneratedDecoratorNodeInstance<DecoratorNodeValueMap<Props>, TOutput, TSerialized>,
    TOutput
  >
  version?: number
  importSpec?: CardImportSpec
  /** The edit-mode fact as data (most cards have one; image/gallery/horizontalrule/footnotedefinition don't). */
  hasEditMode?: boolean
}): GeneratedDecoratorNodeClass<DecoratorNodeValueMap<Props>, TOutput, TSerialized> {
  type GeneratedDataset = DecoratorNodeValueMap<Props>

  const nodeProperties = properties ?? []

  validateArguments(nodeType, nodeProperties)

  const internalProps: (DecoratorNodeProperty & { privateName: string })[] = nodeProperties.map((prop) => ({
    ...prop,
    privateName: `__${prop.name}`,
  }))

  if (importSpec) {
    validateImportSpec(importSpec, internalProps, nodeType)
  }

  class GeneratedDecoratorNode extends InklingDecoratorNode {
    // Function-local escape hatch for the spec-driven dynamic assignments below
    // (`this[prop.privateName] = …`); never visible to consumers (see the note
    // on `GeneratedDecoratorNodeBase`).
    [key: string]: unknown

    /** Read off the node's actual class at runtime, so a subclass adopts a spec by redeclaring this static. */
    static nestedEditors: readonly NestedEditorSpec[] | undefined = undefined

    /** Read off the node's actual class at runtime, so a subclass adopts a spec by redeclaring this static. */
    static transientProps: readonly TransientPropSpec[] | undefined = undefined

    /**
     * Exposed as a static so `importDOM` and the classification invariant read it
     * off the class. Undefined for cards with a hand-written parser.
     */
    static importSpec: CardImportSpec | undefined = importSpec

    /**
     * Reads the spec off `this` — the class Lexical invokes `importDOM` on — so
     * assembled/wrapper subclasses construct themselves and a subclass
     * redeclaring `static importSpec` derives from its own spec. Spec-less
     * classes yield null, which Lexical tolerates.
     */
    static importDOM() {
      return this.importSpec ? buildImportConversions(this.importSpec, this) : null
    }

    // The union admits both the import-conversion payload record and the typed
    // partial dataset without either side asserting the other.
    constructor(data: Partial<DecoratorNodeValueMap<Props>> | Record<string, unknown> = {}, key?: string) {
      super(key)
      const dataset = data as Record<string, unknown>
      internalProps.forEach((prop) => {
        this[prop.privateName] = dataset[prop.name] ?? prop.default
      })

      getNestedEditorSpecs(this).forEach((spec) => {
        const editorProperty = `__${spec.name}`
        // Payloads crossing the constructor are untrusted: adopt a nested editor
        // only when it really is a LexicalEditor instance, else start a fresh one
        const passedEditor = dataset[spec.name]
        const nestedEditor = setupNestedEditor({
          editor: isLexicalEditor(passedEditor) ? passedEditor : undefined,
          nodes: spec.nodes,
        })
        this[editorProperty] = nestedEditor

        const serialized = dataset[spec.serializedKey]
        if (!isLexicalEditor(passedEditor) && typeof serialized === 'string' && serialized) {
          // store the initial state separately as it's passed in to
          // `<CollaborationPlugin />` when no YJS document exists
          this[`${editorProperty}InitialState`] = populateNestedEditor(nestedEditor, serialized)
        }
      })

      getTransientPropSpecs(this).forEach((spec) => {
        this[getTransientPropPrivateName(spec)] = spec.initial ? spec.initial(dataset) : dataset[spec.name]
      })
    }

    static getType() {
      return nodeType
    }

    isInklingCard(): true {
      return true
    }

    static clone(node: GeneratedDecoratorNodeInstance<DecoratorNodeValueMap<Props>, TOutput>) {
      return new this(node.getDataset(), node.__key)
    }

    /** Default values per declared property, so editor code can detect changed properties. */
    static getPropertyDefaults() {
      // The reduce writes every declared property's default by construction, but
      // TS cannot relate dynamically-written keys to DecoratorNodeValueMap<Props>,
      // and no runtime check can prove the mapped type of a generic.
      const defaults = internalProps.reduce((obj: Record<string, unknown>, prop) => {
        obj[prop.name] = prop.default
        return obj
      }, {})
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the comment above; the reduce builds the full mapped shape by construction
      return defaults as DecoratorNodeValueMap<Props>
    }

    /**
     * URL-bearing properties with their `urlType`, for the out-of-repo rebasing
     * pass that rewrites payload URLs to `__INKLING_URL__/relative/path/` (the
     * marker `utils/content-image-url.ts` matches). Write-only in-repo: do not
     * flag as dead.
     */
    static get urlTransformMap() {
      const map: Record<string, string> = {}

      internalProps.forEach((prop) => {
        if (prop.urlType) {
          if (prop.urlPath) {
            map[prop.urlPath] = prop.urlType
          } else {
            map[prop.name] = prop.urlType
          }
        }
      })

      return map
    }

    getDataset() {
      const self = this.getLatest()

      const dataset: Record<string, unknown> = {}
      internalProps.forEach((prop) => {
        dataset[prop.name] = self[prop.privateName]
      })

      return this.appendTransientDataset(this.appendNestedEditorDataset(dataset))
    }

    /**
     * Appends the client-side nested-editor keys (`<name>` and, unless the spec
     * opts out, `<name>InitialState`). Mutates and returns the dataset; a no-op
     * when the class has no `nestedEditors` spec.
     */
    appendNestedEditorDataset<T extends Record<string, unknown>>(dataset: T): T {
      const specs = getNestedEditorSpecs(this)
      if (specs.length > 0) {
        const target = dataset as Record<string, unknown>
        const self = this.getLatest()
        specs.forEach((spec) => {
          target[spec.name] = self[`__${spec.name}`]
          if (spec.exposeInitialStateInDataset !== false) {
            target[`${spec.name}InitialState`] = self[`__${spec.name}InitialState`]
          }
        })
      }
      return dataset
    }

    /**
     * Appends the transient-prop keys a spec exposes through `datasetKey`.
     * Mutates and returns the dataset; a no-op when the class has no
     * `transientProps` spec.
     */
    appendTransientDataset<T extends Record<string, unknown>>(dataset: T): T {
      const specs = getTransientPropSpecs(this)
      if (specs.length > 0) {
        const target = dataset as Record<string, unknown>
        specs.forEach((spec) => {
          if (spec.datasetKey) {
            target[spec.datasetKey] = this[getTransientPropPrivateName(spec)]
          }
        })
      }
      return dataset
    }

    static importJSON(serializedNode: Record<string, unknown>) {
      const data: Record<string, unknown> = {}

      internalProps.forEach((prop) => {
        data[prop.name] = serializedNode[prop.name]
      })

      // Trust boundary: payloads are trusted to match the declared prop types
      // (the same model as Lexical's own importJSON); only the nested-editor
      // slots are guarded in the constructor, where a wrong-typed value would
      // crash setup immediately instead of failing later at read/export time.
      return new this(data)
    }

    /** Serializes the node; the JSON is what gets saved to the database. */
    exportJSON(): TSerialized {
      const dataset = {
        type: nodeType,
        version: version,
        ...internalProps.reduce((obj: Record<string, unknown>, prop) => {
          obj[prop.name] = prop.redactDataUrl ? redactDataUrlValue(this[prop.name]) : this[prop.name]
          return obj
        }, {}),
      }
      // The body builds TSerialized's default shape; remapping subclasses
      // override exportJSON wholesale, so the cast is the bridge.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the dataset is TSerialized's default shape; remapping subclasses override wholesale
      return this.serializeNestedEditorHtml(dataset) as unknown as TSerialized
    }

    /**
     * Re-serializes each nested editor's content into its `serializedKey`
     * property, since the editor's content may not be reflected there. Mutates
     * and returns the JSON; a no-op when the class has no `nestedEditors` spec.
     */
    serializeNestedEditorHtml<T extends Record<string, unknown>>(json: T): T {
      const target = json as Record<string, unknown>
      getNestedEditorSpecs(this).forEach((spec) => {
        // narrow instead of asserting: the constructor guarantees a real
        // LexicalEditor, while the round-trip detach nulls the field
        const editor: unknown = this[`__${spec.name}`]
        if (isLexicalEditor(editor)) {
          editor.getEditorState().read(() => {
            const html = $generateHtmlFromNodes(editor, null)
            target[spec.serializedKey] = cleanBasicHtml(html, spec.cleanBasicHtml)
          })
        }
      })
      return json
    }

    exportDOM(_editor: LexicalEditor, options: ExportDOMOptions = {}): TOutput {
      if (!defaultRenderFn) {
        throw new Error(`[generateDecoratorNode] ${nodeType}: "defaultRenderFn" is required`)
      }

      const context = createRenderContext(options)
      // The class's dynamic-dataset index signature makes `this` unprovable as
      // the instance type; the asserted shape is true of the runtime object.
      return defaultRenderFn(
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the generated class supplies every instance member at runtime; TS cannot see past the index signature
        this as unknown as GeneratedDecoratorNodeInstance<GeneratedDataset, TOutput, TSerialized>,
        context,
      )
    }

    /* c8 ignore start */
    /** Inserts the node in the DOM. Required when extending DecoratorNode. */
    createDOM() {
      return document.createElement('div')
    }

    /** Required when extending DecoratorNode. */
    updateDOM() {
      return false
    }

    /** Whether the node is inline; cards are top-level blocks, so override if needed. */
    isInline() {
      return false
    }
    /* c8 ignore stop */

    /** Edit-mode fact from the options bag, not a per-class override. */
    hasEditMode() {
      return hasEditMode
    }

    getTextContent() {
      const self = this.getLatest()
      const propertiesWithText = nodeProperties.filter((prop) => !!prop.wordCount)

      const text = propertiesWithText
        .map((prop) => readTextContent(self, prop.name))
        .filter(Boolean)
        .join('\n')

      return text ? `${text}\n\n` : ''
    }
  }

  /**
   * Generates a getter and setter per property, so `node.content` reads the
   * latest private field and assigning it writes through `getWritable()`.
   */
  internalProps.forEach((prop) => {
    const invalidatedSlots = prop.invalidates?.map((name) => `__${name}`)

    defineFieldAccessor(
      GeneratedDecoratorNode.prototype,
      prop.name,
      prop.privateName,
      invalidatedSlots
        ? (writable, newVal) =>
            applyArtifactSlotInvalidation(writable[prop.privateName] !== newVal, writable, invalidatedSlots)
        : undefined,
    )
  })

  // The class-to-interface bridge documented on GeneratedDecoratorNodeBase:
  // the function-local class supplies every declared member at runtime, but its
  // index signature and generic dataset members are not provably the interface
  // shape.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- class-factory boundary; the generated class is the interface at runtime
  return GeneratedDecoratorNode as unknown as GeneratedDecoratorNodeClass<
    DecoratorNodeValueMap<Props>,
    TOutput,
    TSerialized
  >
}
