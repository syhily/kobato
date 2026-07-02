import type { ElementNode } from 'lexical'

/* c8 ignore start */
import { $isParagraphNode } from 'lexical'

import type { ExportChildren } from '@/ui/inkling-editor/html/renderer/transformers/index'
import type { RendererOptions } from '@/ui/inkling-editor/html/renderer/types'
/* c8 ignore stop */

export default {
  export(node: ElementNode, options: RendererOptions, exportChildren: ExportChildren) {
    if (!$isParagraphNode(node)) {
      return null
    }

    return `<p>${exportChildren(node)}</p>`
  },
}
