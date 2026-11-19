import type { ElementNode, LexicalEditor, LexicalNode } from 'lexical'

import { $isFootnoteRefNode } from '@kobato/inkling-internal/nodes/footnote/FootnoteRefNode'
import { $isMathInlineNode } from '@kobato/inkling-internal/nodes/math/MathInlineNode'
import { registerNodeTransformIfPresent } from '@kobato/inkling-internal/transforms/register-node-transform'
import { TableCellNode } from '@lexical/table'
import { $createParagraphNode, $isElementNode, $isParagraphNode } from 'lexical'

const ILLEGAL_CELL_INLINE_NODES: ReadonlyArray<(node: LexicalNode) => boolean> = [$isMathInlineNode, $isFootnoteRefNode]
function $isIllegalCellInlineNode(node: LexicalNode): boolean {
  return ILLEGAL_CELL_INLINE_NODES.some((isIllegal) => isIllegal(node))
}

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
