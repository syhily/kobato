import type { DOMConversionMap, LexicalEditor, SerializedLexicalNode } from 'lexical'

import { $generateHtmlFromNodes } from '@lexical/html'
import { isLexicalEditor } from 'lexical'

import type { ExportDOMOptions, ExportDOMOutput } from '@/nodes/base/export-dom'
import type { RenderContext } from '@/nodes/base/render-context'

import { cleanBasicHtml } from '@/html/clean-basic-html'
import {
  getNestedEditorSpecs,
  getTransientPropPrivateName,
  getTransientPropSpecs,
  type DecoratorNodeProperty,
  type NestedEditorSpec,
  type TransientPropSpec,
} from '@/nodes/base/card-specs'
import { buildImportConversions, validateImportSpec, type CardImportSpec } from '@/nodes/base/import-spec'
import { InklingDecoratorNode } from '@/nodes/base/InklingDecoratorNode'
import { createRenderContext } from '@/nodes/base/render-context'
import readTextContent from '@/nodes/base/utils/read-text-content'
import { populateNestedEditor, setupNestedEditor } from '@/nodes/nested-editors'

// The render context is the ONLY export-time view a render fn receives
// besides the node: render policy (URL, sanitization, feature flags) and the
// image/markdown data options all live behind it
// (plans 040/042). The public `exportDOM(editor, options)` entry point
// builds the context from the options bag; the bag itself never reaches the
// render fn. The node parameter is typed as the generated instance itself
// (below), so a render fn's declared node view must be a shape the instance
// genuinely satisfies — strict parameter contravariance rejects narrower
// fictions (e.g. `width: number` where the dataset is `number | null`).
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
 * Validates the required arguments passed to `generateDecoratorNode`
 */
function validateArguments(nodeType: string, properties: readonly DecoratorNodeProperty[]) {
  /* c8 ignore start */
  if (!nodeType) {
    throw new Error('[generateDecoratorNode] A unique "nodeType" should be provided')
  }

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
  })
  /* c8 ignore stop */
}

/**
 * The artifact-slot edit-invalidation invariant, one implementation for the
 * generated setters (from the spec's `invalidates` entries) and the one
 * non-generated node (MathInlineNode's tex setter): only EDITS clear the
 * slots — the constructor and importJSON assign the private fields
 * directly, so a host-filled artifact survives deserialization and cloning.
 */
export function applyArtifactSlotInvalidation<K extends string>(
  changed: boolean,
  writable: Record<K, unknown>,
  slotPrivateNames: readonly K[],
): void {
  if (!changed) {
    return
  }
  // the finite-key record is the true shape: the generated FieldCarrier
  // (index signature) and the hand-written MathInlineNode (declared __*
  // fields) are both structurally assignable — no cast at either call site
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
 * properties: every `{ name: 'src' }` property is stored on (and readable
 * through) `__src` at the property's value type. This is what closes the
 * field seam — `__`-prefixed reads on a typed card node are checked against
 * the card's declared vocabulary instead of an open index signature.
 * Transient-prop and nested-editor fields (`__triggerFileDialog`,
 * `__captionEditor`, …) are per-class spec state, not dataset properties;
 * each card's shim type derives them from the declaration's spec one layer
 * up via `CardSpecFieldMap`.
 */
type PrivateDatasetFields<TDataset extends Record<string, unknown>> = {
  [K in keyof TDataset as `__${string & K}`]: TDataset[K]
}

// An intersection rather than Lexical's `Spread` utility: `Spread` isn't provably
// assignable to `SerializedLexicalNode` when TDataset is an unresolved generic, which
// breaks the `exportJSON` override inside `generateDecoratorNode`. The trade-off is
// that a dataset property colliding with `type`/`version` at an incompatible type
// produces `never` — keep such properties compatible (e.g. HeaderNode's `version: number`).
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
  /**
   * Polymorphic: the body constructs `new this(dataset, key)`, so cloning a
   * card subclass yields that subclass — the fixed base-instance return was
   * a type-level lie every card test cast around.
   */
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

// Type-only view of the generated node's instance side, used in the instance
// intersection above and by consumers holding a card node without its
// concrete dataset type. Extending InklingDecoratorNode keeps generated nodes
// LexicalNode-typed while declaring the generated members. This cannot be a
// merged declaration on the generator's real class: that class is
// function-local and its dataset members depend on the function's type
// parameters, which merged declarations cannot capture. The surface is
// declared here once, as types only — the generated class below supplies
// every member at runtime, and the return-site cast bridges the two.
//
// There is deliberately NO index signature here: field reads on a card node
// must resolve against the card's declared vocabulary (the dataset
// properties, mirrored as typed `__<name>` fields by `PrivateDatasetFields`,
// plus the per-class transient/nested-editor fields the wrapper node types
// declare). The function-local class below keeps its own index signature for
// its dynamic spec-driven assignments; it never reaches consumers because
// the class is only exposed through the `GeneratedDecoratorNodeClass` cast.
export interface GeneratedDecoratorNodeBase<
  TDataset extends Record<string, unknown> = Record<string, unknown>,
  TSerialized extends SerializedLexicalNode = SerializedGeneratedDecoratorNode<TDataset>,
> extends InklingDecoratorNode {
  getDataset(): Record<string, unknown>
  appendNestedEditorDataset<T extends Record<string, unknown>>(dataset: T): T
  appendTransientDataset<T extends Record<string, unknown>>(dataset: T): T
  serializeNestedEditorHtml<T extends Record<string, unknown>>(json: T): T
  // closed on typed instances (SerializedLexicalNode & TDataset); the
  // default keeps the open bag for consumers holding a card without its
  // concrete dataset type. Cards that remap on export (bookmark's nested
  // metadata, the footnote definition's index) declare their own
  // TSerialized — see the generator's third type parameter.
  exportJSON(): TSerialized
  isInklingCard(): true
  hasEditMode(): boolean
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
  // The render fn's declared node type is checked against the generated
  // instance shape: it must accept the instance, so every key it reads must
  // exist on the node's dataset at the dataset's true (widened) type.
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

  // Adds a `privateName` field to the properties for convenience (e.g. `__name`):
  // properties: [{name: 'name', privateName: '__name', default: 'hello'}, {...}]
  const internalProps: (DecoratorNodeProperty & { privateName: string })[] = nodeProperties.map((prop) => ({
    ...prop,
    privateName: `__${prop.name}`,
  }))

  // The import spec names the card's DOM-import knowledge (CONTEXT.md:
  // "import spec"); validate it against the property list at class-creation
  // time so a read naming an unknown property fails loudly here.
  if (importSpec) {
    validateImportSpec(importSpec, internalProps, nodeType)
  }

  class GeneratedDecoratorNode extends InklingDecoratorNode {
    // Function-local escape hatch for the spec-driven dynamic assignments
    // below (`this[prop.privateName] = …`). Never visible to consumers: the
    // class is only exposed through the `GeneratedDecoratorNodeClass` cast,
    // whose instance side has no index signature (see the note on
    // `GeneratedDecoratorNodeBase`).
    [key: string]: unknown

    /**
     * The card's nested-editor spec entries (CONTEXT.md: "card spec"). Read
     * off the node's actual class at runtime, so subclasses adopt a spec by
     * redeclaring this static while the generated class itself (and spec-less
     * subclasses) run no nested-editor behaviour.
     */
    static nestedEditors: readonly NestedEditorSpec[] | undefined = undefined

    /**
     * The card's transient-prop spec entries (CONTEXT.md: "card spec"). Read
     * off the node's actual class at runtime, so subclasses adopt a spec by
     * redeclaring this static while the generated class itself (and spec-less
     * subclasses) run no transient-prop behaviour.
     */
    static transientProps: readonly TransientPropSpec[] | undefined = undefined

    /**
     * The card's import spec (CONTEXT.md: "import spec"), exposed as a static
     * so `importDOM` and the classification invariant read it off the class.
     * Undefined for cards whose structural parsing keeps a hand-written
     * parser.
     */
    static importSpec: CardImportSpec | undefined = importSpec

    /**
     * The derived DOM-import conversions (CONTEXT.md: "import spec"). Reads
     * the spec off `this` — the class Lexical invokes `importDOM` on — so
     * assembled/wrapper subclasses construct themselves and nested editors
     * keep populating on paste, and a subclass redeclaring `static importSpec`
     * derives from its own spec (the same adoption idiom as `nestedEditors`).
     * Spec-less classes (MarkdownNode; cards with structural hand-written
     * parsers, which override this) yield no conversions; Lexical tolerates
     * the null return.
     */
    static importDOM() {
      return this.importSpec ? buildImportConversions(this.importSpec, this) : null
    }

    // The import-conversion boundary constructs nodes from a plain payload
    // record (import-spec.ts); the union admits both that record and the
    // typed partial dataset without either side asserting the other.
    constructor(data: Partial<DecoratorNodeValueMap<Props>> | Record<string, unknown> = {}, key?: string) {
      super(key)
      const dataset = data as Record<string, unknown>
      internalProps.forEach((prop) => {
        this[prop.privateName] = dataset[prop.name] ?? prop.default
      })

      // set up nested editor instances, then populate them on initial
      // construction from their serialized HTML property when no editor
      // instance was passed in
      getNestedEditorSpecs(this).forEach((spec) => {
        const editorProperty = `__${spec.name}`
        // Payloads crossing the constructor are untrusted (see the importJSON
        // trust-boundary note): adopt a nested editor only when it really is
        // a LexicalEditor instance — a truthy non-editor value falls back to
        // a fresh editor rather than being asserted into setupNestedEditor
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

      // initialize transient (client-side-only) props from the dataset;
      // runs after the nested editors, matching the historical order in
      // which wrapper constructors assigned these fields after super()
      getTransientPropSpecs(this).forEach((spec) => {
        this[getTransientPropPrivateName(spec)] = spec.initial ? spec.initial(dataset) : dataset[spec.name]
      })
    }

    /**
     * Returns the node's unique type
     * @extends DecoratorNode
     * @see https://lexical.dev/docs/concepts/nodes#extending-decoratornode
     * @returns {string}
     */
    static getType() {
      return nodeType
    }

    isInklingCard(): true {
      return true
    }

    /**
     * Creates a copy of an existing node with all its properties
     * @extends DecoratorNode
     * @see https://lexical.dev/docs/concepts/nodes#extending-decoratornode
     */
    static clone(node: GeneratedDecoratorNodeInstance<DecoratorNodeValueMap<Props>, TOutput>) {
      return new this(node.getDataset(), node.__key)
    }

    /**
     * Returns default values for any properties, allowing our editor code
     * to detect when a property has been changed
     */
    static getPropertyDefaults() {
      return internalProps.reduce((obj: Record<string, unknown>, prop) => {
        obj[prop.name] = prop.default
        return obj
      }, {}) as DecoratorNodeValueMap<Props>
    }

    /**
     * Transforms URLs contained in the payload to relative paths (`__INKLING_URL__/relative/path/`),
     * so that URLs to be changed without having to update the database
     *
     * Write-only in-repo: the consumer is an out-of-repo URL-rebasing pass that rewrites payload
     * URLs to `__INKLING_URL__/...` paths — the marker `src/nodes/base/utils/content-image-url.ts`
     * matches. Kept for that consumer; do not flag as dead.
     * @see upstream URL utilities
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

    /**
     * Convenience method to get all properties of the node
     * @returns {Object} - The node's properties
     */
    getDataset() {
      const self = this.getLatest()

      const dataset: Record<string, unknown> = {}
      internalProps.forEach((prop) => {
        dataset[prop.name] = self[prop.privateName]
      })

      return this.appendTransientDataset(this.appendNestedEditorDataset(dataset))
    }

    /**
     * Appends the client-side nested-editor keys (`<name>` and, unless the
     * spec opts out, `<name>InitialState`) to a dataset. Mutates and returns
     * the passed-in dataset; a no-op when the node's class has no
     * `nestedEditors` spec. Also called by hand-written `getDataset`
     * overrides (e.g. Bookmark's metadata remap).
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
     * Appends the transient-prop keys a spec exposes (only specs naming a
     * `datasetKey`) to a dataset, reading the current field off `this` —
     * mirroring the hand-written `getDataset` overrides this replaces
     * (Image exposed `dataset.__previewSrc = this.__previewSrc`). Mutates and
     * returns the passed-in dataset; a no-op when the node's class has no
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

    /**
     * Converts JSON to a Lexical node
     * @see https://lexical.dev/docs/concepts/serialization#lexicalnodeimportjson
     * @extends DecoratorNode
     * @param {Object} serializedNode - Lexical's representation of the node, in JSON format
     */
    static importJSON(serializedNode: Record<string, unknown>) {
      const data: Record<string, unknown> = {}

      internalProps.forEach((prop) => {
        data[prop.name] = serializedNode[prop.name]
      })

      // Trust boundary: payloads are trusted to match the declared prop types
      // (same model as Lexical's own importJSON and upstream koenig). Only
      // BookmarkNode validates its payload; a corrupt payload lands wrong-typed
      // values in `__` fields and fails later at read/export time. The
      // constructor does guard the nested-editor slots (real LexicalEditor
      // instance, string HTML), where a wrong-typed value would crash setup
      // immediately instead of failing later.
      return new this(data as Partial<DecoratorNodeValueMap<Props>>)
    }

    /**
     * Serializes a Lexical node to JSON. The JSON content is then saved to the database.
     * @extends DecoratorNode
     * @see https://lexical.dev/docs/concepts/serialization#lexicalnodeexportjson
     */
    exportJSON(): TSerialized {
      const dataset = {
        type: nodeType,
        version: version,
        ...internalProps.reduce((obj: Record<string, unknown>, prop) => {
          // the blob guard rides the property spec — an upload-in-progress
          // data-string src must not be persisted
          obj[prop.name] = prop.redactDataUrl ? redactDataUrlValue(this[prop.name]) : this[prop.name]
          return obj
        }, {}),
      }
      // the body builds the dataset-serialized shape (TSerialized's default);
      // remapping subclasses override exportJSON wholesale — the cast is the
      // bridge, like the class-to-interface one at the return site
      return this.serializeNestedEditorHtml(dataset) as unknown as TSerialized
    }

    /**
     * Converts nested editor instances back into cleaned HTML on their
     * `serializedKey` properties, because their content may not be
     * automatically updated when the nested editor changes. Mutates and
     * returns the passed-in JSON; a no-op when the node's class has no
     * `nestedEditors` spec. Also called by hand-written `exportJSON`
     * overrides (e.g. Image/Video blob-src guards, Bookmark's metadata remap).
     */
    serializeNestedEditorHtml<T extends Record<string, unknown>>(json: T): T {
      const target = json as Record<string, unknown>
      getNestedEditorSpecs(this).forEach((spec) => {
        const editor = this[`__${spec.name}`] as LexicalEditor | null | undefined
        if (editor) {
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

      // One read-only render context per export — the only export-time view
      // the render fn receives besides the node (plan 042).
      const context = createRenderContext(options)
      // The class's dynamic-dataset index signature makes `this` unprovable
      // as the instance type (see the return-cast note below), but unlike the
      // old inferred TRenderNode the asserted shape is now TRUE of the
      // runtime object: the dataset keys at their widened types.
      return defaultRenderFn(
        this as unknown as GeneratedDecoratorNodeInstance<GeneratedDataset, TOutput, TSerialized>,
        context,
      )
    }

    /* c8 ignore start */
    /**
     * Inserts node in the DOM. Required when extending the DecoratorNode.
     * @extends DecoratorNode
     * @see https://lexical.dev/docs/concepts/nodes#extending-decoratornode
     */
    createDOM() {
      return document.createElement('div')
    }

    /**
     * Required when extending the DecoratorNode
     * @extends DecoratorNode
     * @see https://lexical.dev/docs/concepts/nodes#extending-decoratornode
     */
    updateDOM() {
      return false
    }

    /**
     * Defines whether a node is a top-level block.
     * @see https://lexical.dev/docs/api/classes/lexical.DecoratorNode#isinline
     */
    isInline() {
      // All our cards are top-level blocks. Override if needed.
      return false
    }
    /* c8 ignore stop */

    /**
     * Defines whether a node has an edit mode in the editor UI — the
     * options-bag fact, not a per-class override.
     */
    hasEditMode() {
      return hasEditMode
    }

    /*
     * Returns the text content of the node, used by the editor to calculate the word count
     * This method filters out properties without `wordCount: true`
     */
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
   * Generates getters and setters for each property, following ES6 syntax
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/get
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/set
   *
   * Example: for a given property 'content', the generated getter and setter will be:
   * get content() {
   *    const self = this.getLatest();
   *    return self.__content;
   * }
   *
   * set content(newVal) {
   *   const writable = this.getWritable();
   *   writable.__content = newVal;
   * }
   *
   * They can be used as `node.content` (getter) and `node.content = 'new value'` (setter)
   */
  // the generated accessors' `this`, typed once: the class keeps a dynamic
  // index signature for its spec-driven fields (see the class-body note)
  interface FieldCarrier {
    getLatest(): Record<string, unknown>
    getWritable(): Record<string, unknown>
  }

  internalProps.forEach((prop) => {
    // the artifact slots this property's edits clear, resolved to their
    // private names once (CONTEXT.md "artifact slot": edit-invalidates)
    const invalidatedSlots = prop.invalidates?.map(
      (name) => internalProps.find((candidate) => candidate.name === name)?.privateName ?? `__${name}`,
    )

    Object.defineProperty(GeneratedDecoratorNode.prototype, prop.name, {
      get: function (this: FieldCarrier) {
        const self = this.getLatest()
        return self[prop.privateName]
      },
      set: function (this: FieldCarrier, newVal: unknown) {
        const writable = this.getWritable()
        if (invalidatedSlots) {
          applyArtifactSlotInvalidation(writable[prop.privateName] !== newVal, writable, invalidatedSlots)
        }
        writable[prop.privateName] = newVal
      },
    })
  })

  return GeneratedDecoratorNode as unknown as GeneratedDecoratorNodeClass<
    DecoratorNodeValueMap<Props>,
    TOutput,
    TSerialized
  >
}
