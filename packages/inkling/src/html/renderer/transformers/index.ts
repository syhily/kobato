/* c8 ignore start */
import type { ElementNode } from 'lexical'

import type { RenderContext } from '../../../nodes/base/render-context'

import { listTransformer } from './element/list'
import { simpleElementTransformers } from './element/simple-transformers'
import { tableTransformer } from './element/table'
/* c8 ignore stop */

export type ExportChildren = (node: ElementNode) => string
export type ElementTransformer = {
  export: (node: ElementNode, exportChildren: ExportChildren, context: RenderContext) => string | null
}

const elementTransformers: ElementTransformer[] = [...simpleElementTransformers, listTransformer, tableTransformer]

export default elementTransformers
