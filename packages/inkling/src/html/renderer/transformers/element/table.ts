/* c8 ignore start */
import type { ElementTransformer, ExportChildren } from '@kobato/inkling-internal/html/renderer/transformers/index'
import type { ElementNode } from 'lexical'

import { getTableCellTag } from '@kobato/inkling-internal/nodes/table/table-facts'
import { $isTableCellNode, $isTableNode, $isTableRowNode } from '@kobato/inkling-internal/nodes/table/TableNodes'
/* c8 ignore stop */

export const tableTransformer: ElementTransformer = {
  export(node: ElementNode, exportChildren: ExportChildren) {
    if (!$isTableNode(node)) {
      return null
    }

    const rows = node
      .getChildren()
      .filter($isTableRowNode)
      .map((row) => {
        const cells = row
          .getChildren()
          .filter($isTableCellNode)
          .map((cell) => {
            const tag = getTableCellTag(cell)
            return `<${tag}>${exportChildren(cell)}</${tag}>`
          })
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')

    return `<table>${rows}</table>`
  },
}
