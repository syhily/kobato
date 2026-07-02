/* c8 ignore start */
import type { ElementNode } from 'lexical'

import type { RendererOptions } from '@/ui/inkling-editor/html/renderer/types'

import asideTransformer from '@/ui/inkling-editor/html/renderer/transformers/element/aside'
import blockquoteTransformer from '@/ui/inkling-editor/html/renderer/transformers/element/blockquote'
import headingTransformer from '@/ui/inkling-editor/html/renderer/transformers/element/heading'
import listTransformer from '@/ui/inkling-editor/html/renderer/transformers/element/list'
import paragraphTransformer from '@/ui/inkling-editor/html/renderer/transformers/element/paragraph'
/* c8 ignore stop */

export type ExportChildren = (node: ElementNode, options?: RendererOptions) => string
export type ElementTransformer = {
  export: (node: ElementNode, options: RendererOptions, exportChildren: ExportChildren) => string | null
}

const elementTransformers: ElementTransformer[] = [
  paragraphTransformer,
  headingTransformer,
  listTransformer,
  blockquoteTransformer,
  asideTransformer,
]

export default elementTransformers
