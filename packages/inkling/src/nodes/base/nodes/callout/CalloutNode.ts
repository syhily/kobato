import type {
  DecoratorNodeProperty,
  NestedEditorFieldMap,
  NestedEditorSpec,
} from '@kobato/inkling-internal/nodes/base/card-specs'
import type { CardImportSpec } from '@kobato/inkling-internal/nodes/base/import-spec'
import type { LexicalEditor } from 'lexical'

import {
  generateDecoratorNode,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
import { renderCalloutNode } from '@kobato/inkling-internal/nodes/base/nodes/callout/callout-renderer'
import MINIMAL_NODES from '@kobato/inkling-internal/nodes/MinimalNodes'

export const calloutNestedEditors = [
  {
    name: 'calloutTextEditor',
    serializedKey: 'calloutText',
    nodes: MINIMAL_NODES,
    cleanBasicHtml: { allowBr: true },
    nullable: true,
  },
] as const satisfies readonly NestedEditorSpec[]

export interface CalloutData {
  calloutText?: string
  calloutEmoji?: string
  backgroundColor?: string
}

interface CalloutEditorDataset {
  calloutTextEditor?: LexicalEditor
}

// oxlint-disable-next-line typescript/no-empty-object-type -- class+interface merging: self-types the spec-driven fields
export interface BaseCalloutNode extends NestedEditorFieldMap<typeof calloutNestedEditors> {}

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
        { name: 'calloutEmoji', kind: 'html', selector: '.inkling-callout-emoji', trim: true, fallback: '' },
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
  constructor(
    { calloutText, calloutEmoji, backgroundColor, calloutTextEditor }: CalloutData & CalloutEditorDataset = {},
    key?: string,
  ) {
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
