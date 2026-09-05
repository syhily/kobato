import type { LexicalEditor } from 'lexical'

import type { DecoratorNodeProperty } from '@/nodes/base/card-specs'
import type { CardImportSpec } from '@/nodes/base/import-spec'

import {
  generateDecoratorNode,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@/nodes/base/generate-decorator-node'
import { renderCalloutNode } from '@/nodes/base/nodes/callout/callout-renderer'

export interface CalloutData {
  calloutText?: string
  calloutEmoji?: string
  backgroundColor?: string
}

/** Transient nested-editor fields the wrapper layer passes through the constructor. */
interface CalloutEditorDataset {
  calloutTextEditor?: LexicalEditor
}

export interface BaseCalloutNode {
  calloutText: string
  calloutEmoji: string
  backgroundColor: string
}

const calloutProperties = [
  { name: 'calloutText', default: '', wordCount: true },
  { name: 'calloutEmoji', default: '💡' },
  { name: 'backgroundColor', default: 'blue' },
] as const satisfies readonly DecoratorNodeProperty[]

export type SerializedCalloutNode = SerializedGeneratedDecoratorNode<DecoratorNodeValueMap<typeof calloutProperties>>

export const calloutImportSpec = {
  conversions: [
    {
      tag: 'div',
      priority: 1,
      guardClass: 'inkling-callout-card',
      reads: [
        { name: 'calloutText', kind: 'html', selector: '.inkling-callout-text', trim: true, fallback: '' },
        // the hand-written parser's `|| ''` yields '' (not the '💡' default)
        // on a missing emoji element, so the fallback must be explicit
        { name: 'calloutEmoji', kind: 'html', selector: '.inkling-callout-emoji', trim: true, fallback: '' },
        // omitted on no class match, coalescing to the 'blue' default
        { name: 'backgroundColor', kind: 'classMap', classMap: [{ pattern: /inkling-callout-card-(\w+)/ }] },
      ],
    },
  ],
} satisfies CardImportSpec

export class BaseCalloutNode extends generateDecoratorNode({
  nodeType: 'callout',
  properties: calloutProperties,
  defaultRenderFn: renderCalloutNode,
  importSpec: calloutImportSpec,
}) {
  /* override */
  constructor(
    { calloutText, calloutEmoji, backgroundColor, calloutTextEditor }: CalloutData & CalloutEditorDataset = {},
    key?: string,
  ) {
    // Forward the callout text and a passed-in editor so the generated
    // constructor can run the nested-editor setup/populate for wrapper
    // subclasses that adopt a `nestedEditors` spec (a no-op on this class).
    // __calloutText is set by super from the same value (?? '' matches || ''
    // for the string-typed dataset); only the keys super never received are
    // assigned here.
    super({ calloutText, calloutTextEditor }, key)
    this.__calloutEmoji = calloutEmoji ?? '💡'
    this.__backgroundColor = backgroundColor ?? 'blue'
  }
}

export function $isCalloutNode(node: unknown): node is BaseCalloutNode {
  return node instanceof BaseCalloutNode
}

export const $createBaseCalloutNode = (dataset: CalloutData = {}) => {
  return new BaseCalloutNode(dataset)
}
