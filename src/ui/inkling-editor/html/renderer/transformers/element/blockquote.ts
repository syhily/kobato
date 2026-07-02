import type { ElementNode } from 'lexical'

/* c8 ignore start */
import { $isQuoteNode } from '@lexical/rich-text'

import type { ExportChildren } from '@/ui/inkling-editor/html/renderer/transformers/index'
import type { RendererOptions } from '@/ui/inkling-editor/html/renderer/types'
/* c8 ignore stop */

export default {
  export(node: ElementNode, options: RendererOptions, exportChildren: ExportChildren) {
    if (!$isQuoteNode(node)) {
      return null
    }

    if (options.target === 'email') {
      let children = exportChildren(node)

      if (!children.startsWith('<p>')) {
        children = `<p>${children}</p>`
      }

      return `<blockquote>${children}</blockquote>`
    }

    return `<blockquote>${exportChildren(node)}</blockquote>`
  },
}
