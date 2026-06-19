import type { InklingDocument, InklingInlineNode, InklingListItemNode, InklingListNode } from '@/shared/inkling/schema'

function inlineHasText(node: InklingInlineNode): boolean {
  switch (node.type) {
    case 'text':
      return node.text.trim().length > 0
    case 'linebreak':
      return false
    case 'inline-math':
      return node.tex.trim().length > 0
    case 'link':
      return node.children.some(inlineHasText)
    case 'footnote-ref':
      return false
    default:
      return false
  }
}

function listItemHasText(item: InklingListItemNode): boolean {
  for (const child of item.children) {
    if (child.type === 'list') {
      if (listHasText(child)) {
        return true
      }
    } else if (inlineHasText(child)) {
      return true
    }
  }
  return false
}

function listHasText(list: InklingListNode): boolean {
  return list.children.some(listItemHasText)
}

export function isInklingCommentEmpty(document: InklingDocument): boolean {
  for (const block of document.root.children) {
    switch (block.type) {
      case 'paragraph':
      case 'quote':
        if (block.children.some(inlineHasText)) {
          return false
        }
        break
      case 'code-block':
        if (block.code.trim().length > 0) {
          return false
        }
        break
      case 'math-block':
        if (block.tex.trim().length > 0) {
          return false
        }
        break
      case 'list':
        if (listHasText(block)) {
          return false
        }
        break
      default:
        break
    }
  }
  return true
}
