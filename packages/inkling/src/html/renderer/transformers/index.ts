import type { RenderContext } from '@kobato/inkling-internal/nodes/base/render-context'
/* c8 ignore start */
import type { ElementNode } from 'lexical'

import { listTransformer } from '@kobato/inkling-internal/html/renderer/transformers/element/list'
import { simpleElementTransformers } from '@kobato/inkling-internal/html/renderer/transformers/element/simple-transformers'
import { tableTransformer } from '@kobato/inkling-internal/html/renderer/transformers/element/table'
/* c8 ignore stop */

export type ExportChildren = (node: ElementNode) => string
export type ElementTransformer = {
  export: (node: ElementNode, exportChildren: ExportChildren, context: RenderContext) => string | null
}

const elementTransformers: ElementTransformer[] = [...simpleElementTransformers, listTransformer, tableTransformer]

export default elementTransformers
