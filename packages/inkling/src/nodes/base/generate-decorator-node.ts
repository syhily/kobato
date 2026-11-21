import type { ExportDOMOptions, ExportDOMOutput } from '@kobato/inkling-internal/nodes/base/export-dom'
import type { RenderContext } from '@kobato/inkling-internal/nodes/base/render-context'
import type { DOMConversionMap, LexicalEditor, SerializedLexicalNode } from 'lexical'

import { cleanBasicHtml } from '@kobato/inkling-internal/html/clean-basic-html'
import {
  getNestedEditorSpecs,
  getTransientPropPrivateName,
  getTransientPropSpecs,
  type DecoratorNodeProperty,
  type NestedEditorSpec,
  type TransientPropSpec,
} from '@kobato/inkling-internal/nodes/base/card-specs'
import {
  buildImportConversions,
  validateImportSpec,
  type CardImportSpec,
} from '@kobato/inkling-internal/nodes/base/import-spec'
import { InklingDecoratorNode } from '@kobato/inkling-internal/nodes/base/InklingDecoratorNode'
import { createRenderContext } from '@kobato/inkling-internal/nodes/base/render-context'
import readTextContent from '@kobato/inkling-internal/nodes/base/utils/read-text-content'
import { populateNestedEditor, setupNestedEditor } from '@kobato/inkling-internal/nodes/nested-editors'
import { $generateHtmlFromNodes } from '@lexical/html'
import { isLexicalEditor } from 'lexical'

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

export function applyArtifactSlotInvalidation<K extends string>(
  changed: boolean,
  writable: Record<K, unknown>,
  slotPrivateNames: readonly K[],
): void {
  if (!changed) {
    return
  }
  for (const name of slotPrivateNames) {
    writable[name] = ''
  }
}

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

type PrivateDatasetFields<TDataset extends Record<string, unknown>> = {
  [K in keyof TDataset as `__${string & K}`]: TDataset[K]
}

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

export interface GeneratedDecoratorNodeBase<
  TDataset extends Record<string, unknown> = Record<string, unknown>,
  TSerialized extends SerializedLexicalNode = SerializedGeneratedDecoratorNode<TDataset>,
> extends InklingDecoratorNode {
  getDataset(): Record<string, unknown>
  appendNestedEditorDataset<T extends Record<string, unknown>>(dataset: T): T
  appendTransientDataset<T extends Record<string, unknown>>(dataset: T): T
  serializeNestedEditorHtml<T extends Record<string, unknown>>(json: T): T
  exportJSON(): TSerialized
  isInklingCard(): true
  hasEditMode(): boolean
}

interface FieldCarrier {
  getLatest(): Record<string, unknown>
  getWritable(): Record<string, unknown>
}

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
  defaultRenderFn?: RenderFn<
    GeneratedDecoratorNodeInstance<DecoratorNodeValueMap<Props>, TOutput, TSerialized>,
    TOutput
  >
  version?: number
  importSpec?: CardImportSpec
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
    [key: string]: unknown

    static nestedEditors: readonly NestedEditorSpec[] | undefined = undefined

    static transientProps: readonly TransientPropSpec[] | undefined = undefined

    static importSpec: CardImportSpec | undefined = importSpec

    static importDOM() {
      return this.importSpec ? buildImportConversions(this.importSpec, this) : null
    }

    constructor(data: Partial<DecoratorNodeValueMap<Props>> | Record<string, unknown> = {}, key?: string) {
      super(key)
      const dataset = data as Record<string, unknown>
      internalProps.forEach((prop) => {
        this[prop.privateName] = dataset[prop.name] ?? prop.default
      })

      getNestedEditorSpecs(this).forEach((spec) => {
        const editorProperty = `__${spec.name}`
        const passedEditor = dataset[spec.name]
        const nestedEditor = setupNestedEditor({
          editor: isLexicalEditor(passedEditor) ? passedEditor : undefined,
          nodes: spec.nodes,
        })
        this[editorProperty] = nestedEditor

        const serialized = dataset[spec.serializedKey]
        if (!isLexicalEditor(passedEditor) && typeof serialized === 'string' && serialized) {
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

    static getPropertyDefaults() {
      const defaults = internalProps.reduce((obj: Record<string, unknown>, prop) => {
        obj[prop.name] = prop.default
        return obj
      }, {})
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the reduce builds the full mapped shape by construction
      return defaults as DecoratorNodeValueMap<Props>
    }

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

      return new this(data)
    }

    exportJSON(): TSerialized {
      const dataset = {
        type: nodeType,
        version: version,
        ...internalProps.reduce((obj: Record<string, unknown>, prop) => {
          obj[prop.name] = prop.redactDataUrl ? redactDataUrlValue(this[prop.name]) : this[prop.name]
          return obj
        }, {}),
      }
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the dataset is TSerialized's default shape; remapping subclasses override wholesale
      return this.serializeNestedEditorHtml(dataset) as unknown as TSerialized
    }

    serializeNestedEditorHtml<T extends Record<string, unknown>>(json: T): T {
      const target = json as Record<string, unknown>
      getNestedEditorSpecs(this).forEach((spec) => {
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
      return defaultRenderFn(
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the generated class supplies every instance member at runtime; TS cannot see past the index signature
        this as unknown as GeneratedDecoratorNodeInstance<GeneratedDataset, TOutput, TSerialized>,
        context,
      )
    }

    /* c8 ignore start */
    createDOM() {
      return document.createElement('div')
    }

    updateDOM() {
      return false
    }

    isInline() {
      return false
    }
    /* c8 ignore stop */

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

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- class-factory boundary; the generated class is the interface at runtime
  return GeneratedDecoratorNode as unknown as GeneratedDecoratorNodeClass<
    DecoratorNodeValueMap<Props>,
    TOutput,
    TSerialized
  >
}
