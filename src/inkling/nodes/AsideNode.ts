import { addClassNamesToElement, $createParagraphNode, type EditorConfig } from 'lexical'

import { AsideNode as BaseAsideNode } from '@/inkling/nodes/base'

export class AsideNode extends BaseAsideNode {
  createDOM(config: EditorConfig) {
    const element = document.createElement('aside')
    // EditorThemeClasses carries an open `[key: string]: any` index, so the
    // custom `aside` key reads as any — narrow it to the class list
    // addClassNamesToElement expects
    const asideClassNames: unknown = config.theme.aside
    addClassNamesToElement(element, typeof asideClassNames === 'string' ? asideClassNames : undefined)
    return element
  }

  // Mutation

  insertNewAfter() {
    const newBlock = $createParagraphNode()
    const direction = this.getDirection()
    newBlock.setDirection(direction)
    this.insertAfter(newBlock)
    return newBlock
  }

  collapseAtStart() {
    const paragraph = $createParagraphNode()
    const children = this.getChildren()
    children.forEach((child) => paragraph.append(child))
    this.replace(paragraph)
    return true
  }
}

export function $createAsideNode() {
  return new AsideNode()
}

export function $isAsideNode(node: unknown): node is AsideNode {
  return node instanceof AsideNode
}
