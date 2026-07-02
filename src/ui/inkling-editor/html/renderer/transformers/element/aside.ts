import type { ElementNode } from 'lexical'

import type { ExportChildren } from '@/ui/inkling-editor/html/renderer/transformers/index'
import type { RendererOptions } from '@/ui/inkling-editor/html/renderer/types'

import { $isAsideNode } from '@/ui/inkling-editor/nodes/base'

export default {
  export(node: ElementNode, options: RendererOptions, exportChildren: ExportChildren) {
    if (!$isAsideNode(node)) {
      return null
    }

    if (options.target === 'email') {
      let children = exportChildren(node)

      if (!children.startsWith('<p>')) {
        children = `<p>${children}</p>`
      }

      return `<blockquote class="inkling-blockquote-alt">${children}</blockquote>`
    }

    return `<blockquote class="inkling-blockquote-alt">${exportChildren(node)}</blockquote>`
  },
}
