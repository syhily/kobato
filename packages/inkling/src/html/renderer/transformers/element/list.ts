import type { ElementTransformer, ExportChildren } from '@kobato/inkling-internal/html/renderer/transformers/index'
import type { ListNode } from '@lexical/list'
import type { ElementNode } from 'lexical'

import { $isListNode, $isListItemNode } from '@lexical/list'

const exportList = function (node: ElementNode, exportChildren: ExportChildren): string | null {
  if (!$isListNode(node)) {
    return null
  }

  const tag = node.getTag()
  const start = node.getStart()

  let liOpen = false

  const exportListContent = (listNode: ListNode): string => {
    const output: string[] = []
    const children = listNode.getChildren()

    for (const child of children) {
      if (!$isListItemNode(child)) {
        continue
      }

      const listChildren = child.getChildren()

      if ($isListNode(listChildren[0])) {
        output.push(exportList(listChildren[0], exportChildren) ?? '')
        if (liOpen) {
          output.push('</li>')
          liOpen = false
        }
      } else {
        if (liOpen) {
          output.push('</li>')
          liOpen = false
        }
        output.push(`<li>${exportChildren(child)}`)
        liOpen = true
      }
    }

    if (liOpen) {
      output.push('</li>')
      liOpen = false
    }

    return output.join('')
  }

  const listContent = exportListContent(node)

  if (typeof start === 'number' && Number.isFinite(start) && start !== 1) {
    return `<${tag} start="${start}">${listContent}</${tag}>`
  }
  return `<${tag}>${listContent}</${tag}>`
}

export const listTransformer: ElementTransformer = { export: exportList }
