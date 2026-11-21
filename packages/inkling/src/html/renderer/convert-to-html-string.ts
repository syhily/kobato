import type {
  ExportDOMOptions,
  ExportDOMOutputType,
  InlineMarkupExporter,
  InlineMarkupTextEntity,
} from '@kobato/inkling-internal/nodes/base/export-dom'
import type { ElementNode, LexicalEditor, LexicalNode, TextNode } from 'lexical'

import { HTML_POST_PROCESSORS, isTrailingRunNode } from '@kobato/inkling-internal/html/renderer/post-process'
import elementTransformers from '@kobato/inkling-internal/html/renderer/transformers/index'
import TextContent from '@kobato/inkling-internal/html/renderer/utils/TextContent'
import { $isInklingCard } from '@kobato/inkling-internal/nodes/base'
import { createRenderContext } from '@kobato/inkling-internal/nodes/base/render-context'
import { $isLinkNode } from '@lexical/link'
import { $getRoot, $isDecoratorNode, $isElementNode, $isLineBreakNode, $isParagraphNode, $isTextNode } from 'lexical'

function hasInlineMarkupProbe(node: LexicalNode): node is LexicalNode & InlineMarkupTextEntity {
  return 'isInlineMarkupEntity' in node && typeof node.isInlineMarkupEntity === 'function'
}

function $isInlineMarkupTextEntity(node: LexicalNode): node is TextNode & InlineMarkupTextEntity {
  return $isTextNode(node) && hasInlineMarkupProbe(node) && node.isInlineMarkupEntity() === true
}
export default function $convertToHtmlString(editor: LexicalEditor, options: ExportDOMOptions = {}): string {
  const context = createRenderContext(options)

  function renderExportOutput(output: {
    element: HTMLElement | DocumentFragment | Text | null
    type?: ExportDOMOutputType
  }): string {
    if (output.type === 'inner') {
      return getElementInnerHTML(output.element)
    }

    if (output.type === 'value') {
      if (output.element && 'value' in output.element && typeof output.element.value === 'string') {
        return output.element.value
      }

      return ''
    }

    return getElementOuterHTML(output.element)
  }

  function exportInlineMarkup(node: LexicalNode & InlineMarkupExporter): string {
    return renderExportOutput(node.exportDOM(editor, options))
  }

  function exportTopLevelElementOrDecorator(node: LexicalNode): string | null {
    if ($isInklingCard(node)) {
      return renderExportOutput(node.exportDOM(editor, options))
    }
    if ($isElementNode(node)) {
      for (const transformer of elementTransformers) {
        const result = transformer.export(node, exportChildren, context)
        if (result !== null) {
          return result
        }
      }

      return exportChildren(node)
    }

    return null
  }

  function exportChildren(node: ElementNode): string {
    const output: string[] = []

    const textContent = new TextContent(exportChildren, context)

    for (const child of node.getChildren()) {
      if (
        !textContent.isEmpty() &&
        !$isInlineMarkupTextEntity(child) &&
        !$isLineBreakNode(child) &&
        !$isTextNode(child) &&
        !$isLinkNode(child)
      ) {
        output.push(textContent.render())
        textContent.clear()
      }

      if ($isInlineMarkupTextEntity(child)) {
        if (!textContent.isEmpty()) {
          output.push(textContent.render())
          textContent.clear()
        }
        output.push(exportInlineMarkup(child))
      } else if ($isLineBreakNode(child) || $isTextNode(child) || $isLinkNode(child)) {
        textContent.addNode(child)
      } else if ($isDecoratorNode(child) && child.isInline()) {
        output.push(exportInlineMarkup(child))
      } else if ($isElementNode(child)) {
        output.push(exportChildren(child))
      }
    }

    if (!textContent.isEmpty()) {
      output.push(textContent.render())
    }

    return output.join('')
  }

  const output: string[] = []
  const children: LexicalNode[] = $getRoot().getChildren()
  const outputIndexByChild: number[] = []

  for (const child of children) {
    const result = exportTopLevelElementOrDecorator(child)

    outputIndexByChild.push(result === null ? -1 : output.length)
    if (result !== null) {
      output.push(result)
    }
  }

  let lastProseIndex = children.length - 1
  while (lastProseIndex >= 0 && isTrailingRunNode(children[lastProseIndex])) {
    lastProseIndex -= 1
  }
  const lastProse = children[lastProseIndex]
  if (lastProse && $isParagraphNode(lastProse) && lastProse.getTextContent().trim() === '') {
    const removedIndex = outputIndexByChild[lastProseIndex]
    output.splice(removedIndex, 1)

    outputIndexByChild[lastProseIndex] = -1
    for (let i = lastProseIndex + 1; i < outputIndexByChild.length; i += 1) {
      if (outputIndexByChild[i] > removedIndex) {
        outputIndexByChild[i] -= 1
      }
    }
  }

  for (const processor of HTML_POST_PROCESSORS) {
    processor.process({ children, output, outputIndexByChild, context })
  }

  return output.join('')
}

function getElementInnerHTML(element: HTMLElement | DocumentFragment | Text | null): string {
  if (element && 'innerHTML' in element) {
    return element.innerHTML
  }

  return ''
}

function getElementOuterHTML(element: HTMLElement | DocumentFragment | Text | null): string {
  if (element && 'outerHTML' in element) {
    return element.outerHTML
  }
  return ''
}
