import type { ElementNode, LexicalEditor, LexicalNode } from 'lexical'

import { TableCellNode } from '@lexical/table'
import { $createParagraphNode, $isElementNode, $isParagraphNode } from 'lexical'

import { $isFootnoteRefNode } from '@/nodes/footnote/FootnoteRefNode'
import { $isMathInlineNode } from '@/nodes/math/MathInlineNode'
import { registerNodeTransformIfPresent } from '@/transforms/register-node-transform'

// Inline nodes that may never live inside a table cell — the tree-side
// counterpart of kobato's table-cell-guard ILLEGAL_MARK_NAMES (a cell's
// inline set is spans + link, nothing else).
const ILLEGAL_CELL_INLINE_NODES: ReadonlyArray<(node: LexicalNode) => boolean> = [$isMathInlineNode, $isFootnoteRefNode]

function $isIllegalCellInlineNode(node: LexicalNode): boolean {
  return ILLEGAL_CELL_INLINE_NODES.some((isIllegal) => isIllegal(node))
}

// The clean state the guard converges to: exactly one paragraph whose
// descendants are all legal inline nodes. Anything else is flattened.
function $isCellInlineOnly(cell: TableCellNode): boolean {
  const children = cell.getChildren()
  if (children.length !== 1 || !$isParagraphNode(children[0])) {
    return false
  }

  const stack: LexicalNode[] = children[0].getChildren()
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    if (!node.isInline() || $isIllegalCellInlineNode(node)) {
      return false
    }
    if ($isElementNode(node)) {
      stack.push(...node.getChildren())
    }
  }
  return true
}

function $stripIllegalInlineNodes(root: ElementNode): void {
  root.getChildren().forEach((child) => {
    if ($isIllegalCellInlineNode(child)) {
      child.remove()
      return
    }
    if ($isElementNode(child)) {
      $stripIllegalInlineNodes(child)
    }
  })
}

/**
 * The table cell guard (kobato's table-cell-guard, Lexical-side): a cell
 * holds exactly one paragraph of inline content. Blocks pasted or imported
 * into a cell are flattened — their inline content is hoisted depth-first
 * into the single paragraph; illegal inline nodes (math-inline,
 * footnote-ref) are dropped. An empty cell gains the mandatory paragraph.
 */
export function $guardTableCell(cell: TableCellNode): void {
  if ($isCellInlineOnly(cell)) {
    return
  }

  $stripIllegalInlineNodes(cell)

  const content: LexicalNode[] = []
  const collect = (node: LexicalNode): void => {
    if ($isElementNode(node) && !node.isInline()) {
      node.getChildren().forEach(collect)
      return
    }
    content.push(node)
  }
  cell.getChildren().forEach(collect)

  const paragraph = $createParagraphNode()
  paragraph.append(...content)
  cell.clear()
  cell.append(paragraph)
}

export function registerTableCellGuard(editor: LexicalEditor): () => void {
  return registerNodeTransformIfPresent(editor, TableCellNode, $guardTableCell)
}
