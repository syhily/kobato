import type { ExportChildren } from '@kobato/inkling-internal/html/renderer/transformers/index'
import type { RenderContext } from '@kobato/inkling-internal/nodes/base/render-context'
import type { LinkNode } from '@lexical/link'
import type { LexicalNode, TextFormatType } from 'lexical'

import { $isLinkNode } from '@lexical/link'
import { $isTextNode, $isLineBreakNode } from 'lexical'

type TextFormatAbbreviation = 'STRONG' | 'EM' | 'S' | 'U' | 'CODE' | 'SUB' | 'SUP' | 'MARK' | 'SPAN'

const FORMAT_TAG_MAP: Record<TextFormatType, TextFormatAbbreviation> = {
  bold: 'STRONG',
  italic: 'EM',
  strikethrough: 'S',
  underline: 'U',
  code: 'CODE',
  subscript: 'SUB',
  superscript: 'SUP',
  highlight: 'MARK',
  lowercase: 'SPAN',
  uppercase: 'SPAN',
  capitalize: 'SPAN',
}

const TEXT_TRANSFORM_FORMATS: ReadonlySet<TextFormatType> = new Set(['lowercase', 'uppercase', 'capitalize'])

function isTextFormatType(format: string): format is TextFormatType {
  return format in FORMAT_TAG_MAP
}

function isDomElement(node: Node | null): node is HTMLElement {
  return node?.nodeType === 1
}

export default class TextContent {
  nodes: LexicalNode[]
  exportChildren: ExportChildren

  context: RenderContext
  constructor(exportChildren: ExportChildren, context: RenderContext) {
    this.exportChildren = exportChildren
    this.context = context

    this.nodes = []
  }

  addNode(node: LexicalNode): void {
    this.nodes.push(node)
  }

  render(): string {
    const document: Document = this.context.createDocument()
    const root: HTMLElement = document.createElement('div')

    let currentNode = root
    const openFormats: TextFormatType[] = []

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i]

      if ($isLineBreakNode(node)) {
        currentNode.append(document.createElement('BR'))
        continue
      }

      if ($isLinkNode(node)) {
        const anchor = document.createElement('A')
        this._buildAnchorElement(anchor, node)
        currentNode.append(anchor)
        continue
      }

      if ($isTextNode(node)) {
        if (node.getFormat() === 0) {
          currentNode.append(node.getTextContent())
          continue
        }

        const formatsToOpen: TextFormatType[] = []

        for (const format of Object.keys(FORMAT_TAG_MAP)) {
          if (isTextFormatType(format) && node.hasFormat(format) && !openFormats.includes(format)) {
            formatsToOpen.push(format)
          }
        }

        const remainingNodes = this.nodes.slice(i + 1)
        const nextLinkNodeIndex = remainingNodes.findIndex((n) => $isLinkNode(n))
        const remainingSortNodes =
          nextLinkNodeIndex === -1 ? remainingNodes : remainingNodes.slice(0, nextLinkNodeIndex)

        const remainingSortedTextNodes = remainingSortNodes.filter((n) => $isTextNode(n))
        formatsToOpen.sort((a, b) => {
          const aIndex = remainingSortedTextNodes.findIndex((n) => n.hasFormat(a))
          const bIndex = remainingSortedTextNodes.findIndex((n) => n.hasFormat(b))

          if (aIndex === -1) {
            return 1
          }
          if (bIndex === -1) {
            return -1
          }

          return aIndex - bIndex
        })

        for (const format of formatsToOpen) {
          const formatTag = document.createElement(FORMAT_TAG_MAP[format])
          if (TEXT_TRANSFORM_FORMATS.has(format)) {
            formatTag.setAttribute('style', `text-transform: ${format};`)
          }
          currentNode.append(formatTag)
          currentNode = formatTag
          openFormats.push(format)
        }

        currentNode.append(node.getTextContent())

        const nextNode = remainingNodes.find((n) => $isTextNode(n) || $isLinkNode(n))
        const firstFormatToClose = openFormats.findIndex(
          (format) => !nextNode || $isLinkNode(nextNode) || ($isTextNode(nextNode) && !nextNode.hasFormat(format)),
        )

        if (firstFormatToClose !== -1) {
          while (openFormats.length > firstFormatToClose) {
            const parent = currentNode.parentNode
            if (!isDomElement(parent)) {
              break
            }
            currentNode = parent
            openFormats.pop()
          }
        }

        continue
      }
    }

    return root.innerHTML
  }

  isEmpty() {
    return this.nodes.length === 0
  }

  clear() {
    this.nodes = []
  }

  _buildAnchorElement(anchor: HTMLElement, node: LinkNode) {
    const safeHref = this.context.safeUrl('navigation', node.getURL())
    if (safeHref) {
      anchor.setAttribute('href', safeHref)
    }
    const rel = node.getRel()
    if (rel) {
      anchor.setAttribute('rel', rel)
    }
    anchor.innerHTML = this.exportChildren(node)
  }
}
