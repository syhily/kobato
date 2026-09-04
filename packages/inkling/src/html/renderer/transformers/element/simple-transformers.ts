import type { ElementNode } from 'lexical'

/* c8 ignore start */
import { $isHeadingNode, $isQuoteNode } from '@lexical/rich-text'
import { $isParagraphNode } from 'lexical'

import type { ElementTransformer } from '@/html/renderer/transformers/index'
import type { RenderContext } from '@/nodes/base/render-context'

import { $isAsideNode } from '@/nodes/base'
import { slugify } from '@/utils'
/* c8 ignore stop */

// The simple element wrappers — the whole "how a plain element exports"
// policy on one screen: one $is guard and one template each. These were
// one file per two lines (inherited Koenig boilerplate); list and table
// stay their own modules (a nesting state machine and a tree-direct walk).
// The guards are type-exclusive — a node matches exactly one — so their
// order in the registry carries no meaning.

// Element `format` exports as an inline text-align style (upstream
// exportDOM parity), so the alignment kept by opted-in surfaces survives
// the HTML leg; the importer reads it back via $setFormatFromDOM.
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
    // Heading ids are generated on both export paths: the live
    // HtmlOutputPlugin runs this same transformer stack (via
    // $convertToHtmlString), and the per-render dedup tracking lives in the
    // render context, which every render pass builds fresh.
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
