import type { ElementNode } from 'lexical'

/* c8 ignore start */
import type { ElementTransformer, ExportChildren } from '@/html/renderer/transformers/index'

import { getTableCellTag } from '@/nodes/table/table-facts'
import { $isTableCellNode, $isTableNode, $isTableRowNode } from '@/nodes/table/TableNodes'
/* c8 ignore stop */

// The table family exports straight from the tree — not via upstream
// exportDOM, whose cell inline styles and colgroup bookkeeping belong to the
// editing surface, not the published HTML. The header-cell ⇔ <th> mapping
// is declared in @/nodes/table/table-facts (the HTML direction reads the
// header state; the GFM direction forges it). Cell children render inline:
// the renderer's exportChildren flattens the cell's single paragraph into
// the tag without wrapping it in <p>.
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
