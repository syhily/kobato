import type { ListNode } from '@lexical/list'
import type { ElementNode } from 'lexical'

import { $isListNode, $isListItemNode } from '@lexical/list'

import type { ElementTransformer, ExportChildren } from '@/html/renderer/transformers/index'

const exportList = function (node: ElementNode, exportChildren: ExportChildren): string | null {
  if (!$isListNode(node)) {
    return null
  }

  const tag = node.getTag()
  const start = node.getStart()

  // track an open <li> outside of the child loop, we do this so we can nest lists
  // inside <li> elements that already have their contents rendered, e.g.:
  // <li>one
  //   <ol>
  //     <li>one.two</li>
  //   </ol>
  // </li>
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

  // CASE: list has a start value specified > 1.
  // `start` originates from serialized JSON, where a crafted string would be
  // interpolated raw into the attribute — only emit for finite numbers.
  if (typeof start === 'number' && Number.isFinite(start) && start !== 1) {
    return `<${tag} start="${start}">${listContent}</${tag}>`
  } else {
    return `<${tag}>${listContent}</${tag}>`
  }
}

export const listTransformer: ElementTransformer = { export: exportList }
