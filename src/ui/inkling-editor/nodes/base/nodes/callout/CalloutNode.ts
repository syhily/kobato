import {
  generateDecoratorNode,
  type DecoratorNodeProperty,
} from '@/ui/inkling-editor/nodes/base/generate-decorator-node'
import { parseCalloutNode } from '@/ui/inkling-editor/nodes/base/nodes/callout/callout-parser'
import { renderCalloutNode } from '@/ui/inkling-editor/nodes/base/nodes/callout/callout-renderer'

export interface CalloutData {
  calloutText?: string
  calloutEmoji?: string
  backgroundColor?: string
}

export interface CalloutNode {
  calloutText: string
  calloutEmoji: string
  backgroundColor: string
}

const calloutProperties = [
  { name: 'calloutText', default: '', wordCount: true },
  { name: 'calloutEmoji', default: '💡' },
  { name: 'backgroundColor', default: 'blue' },
] as const satisfies readonly DecoratorNodeProperty[]

export class CalloutNode extends generateDecoratorNode({
  nodeType: 'callout',
  properties: calloutProperties,
  defaultRenderFn: renderCalloutNode,
}) {
  /* override */
  constructor({ calloutText, calloutEmoji, backgroundColor }: CalloutData = {}, key?: string) {
    super({}, key)
    this.__calloutText = calloutText || ''
    this.__calloutEmoji = calloutEmoji ?? '💡'
    this.__backgroundColor = backgroundColor || 'blue'
  }

  static importDOM() {
    return parseCalloutNode(this)
  }
}

export function $isCalloutNode(node: unknown): node is CalloutNode {
  return node instanceof CalloutNode
}

export const $createCalloutNode = (dataset: CalloutData = {}) => {
  return new CalloutNode(dataset)
}
