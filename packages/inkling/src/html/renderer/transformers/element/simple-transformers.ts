import type { ElementTransformer } from '@kobato/inkling-internal/html/renderer/transformers/index'
import type { RenderContext } from '@kobato/inkling-internal/nodes/base/render-context'
import type { ElementNode } from 'lexical'

import { $isAsideNode } from '@kobato/inkling-internal/nodes/base'
import { slugify } from '@kobato/inkling-internal/utils'
/* c8 ignore start */
import { $isHeadingNode, $isQuoteNode } from '@lexical/rich-text'
import { $isParagraphNode } from 'lexical'
/* c8 ignore stop */

function formatAttribute(node: ElementNode): string {
  const format = node.getFormatType()
  return format === '' ? '' : ` style="text-align: ${format}"`
}

const paragraphTransformer: ElementTransformer = {
  export(node, exportChildren) {
    if (!$isParagraphNode(node)) {
      return null
    }

    return `<p${formatAttribute(node)}>${exportChildren(node)}</p>`
  },
}

const headingTransformer: ElementTransformer = {
  export(node: ElementNode, exportChildren, context: RenderContext) {
    if (!$isHeadingNode(node)) {
      return null
    }

    const tag = node.getTag()
    const id = context.trackIdAttribute(slugify(node.getTextContent()))

    return `<${tag} id="${id}"${formatAttribute(node)}>${exportChildren(node)}</${tag}>`
  },
}

const blockquoteTransformer: ElementTransformer = {
  export(node, exportChildren) {
    if (!$isQuoteNode(node)) {
      return null
    }

    const children = exportChildren(node)

    return `<blockquote${formatAttribute(node)}>${children}</blockquote>`
  },
}

const asideTransformer: ElementTransformer = {
  export(node, exportChildren) {
    if (!$isAsideNode(node)) {
      return null
    }

    const children = exportChildren(node)

    return `<blockquote class="inkling-blockquote-alt">${children}</blockquote>`
  },
}

export const simpleElementTransformers: ElementTransformer[] = [
  paragraphTransformer,
  headingTransformer,
  blockquoteTransformer,
  asideTransformer,
]
