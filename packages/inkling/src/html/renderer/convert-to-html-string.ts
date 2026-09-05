import type { DOMExportOutput, ElementNode, LexicalEditor, LexicalNode, TextNode } from 'lexical'

import { $isLinkNode } from '@lexical/link'
import { $getRoot, $isDecoratorNode, $isElementNode, $isLineBreakNode, $isParagraphNode, $isTextNode } from 'lexical'

import type { ExportDOMOptions, ExportDOMOutputType, InlineMarkupTextEntity } from '@/nodes/base/export-dom'

import { HTML_POST_PROCESSORS, isTrailingRunNode } from '@/html/renderer/post-process'
import elementTransformers from '@/html/renderer/transformers/index'
import TextContent from '@/html/renderer/utils/TextContent'
import { $isInklingCard } from '@/nodes/base'
import { createRenderContext } from '@/nodes/base/render-context'

/**
 * The inline-markup-entity protocol guard (`@/nodes/base/export-dom`): a
 * TextNode entity that opts in exports element markup spliced into the text
 * flow instead of joining the pending text run. FootnoteRefNode is the
 * first implementor; TKNode (a plain text entity) does not opt in and keeps
 * flowing through TextContent.
 */
function $isInlineMarkupTextEntity(node: LexicalNode): node is TextNode & InlineMarkupTextEntity {
  return $isTextNode(node) && (node as Partial<InlineMarkupTextEntity>).isInlineMarkupEntity?.() === true
}

export default function $convertToHtmlString(editor: LexicalEditor, options: ExportDOMOptions = {}): string {
  // One read-only render context per string render — the only export-time
  // view the element transformers and TextContent receive (plan 042). Card
  // exportDOM builds its own context per call.
  //
  // The string layer itself stays verbatim — that is a deliberate design
  // decision, not an oversight. Sanitization happens inside the card
  // renderers via the render context (`sanitizeBasicHtml` / `sanitizeCardHtml`
  // / `escapeText`) before markup reaches this layer, so the innerHTML /
  // outerHTML / value concatenation below needs no sanitize pass of its own.
  // Do NOT add a blanket sanitize here: it would double-escape markup the
  // renderers already sanitized.
  const context = createRenderContext(options)

  // The recursion closes over the per-render triple (editor, options,
  // context): fixed for the whole pass, so it is not re-passed per level.

  // The one type dispatch every exportDOM splice goes through — top-level
  // cards and inline markup (entities and decorators) alike: 'inner' takes
  // the element's innerHTML, 'value' its value property, anything else
  // (including an absent type) its outerHTML.
  function renderExportOutput(output: {
    element: HTMLElement | DocumentFragment | Text | null
    type?: ExportDOMOutputType
  }): string {
    switch (output.type) {
      case 'inner':
        return getElementInnerHTML(output.element)
      case 'value':
        if (output.element && 'value' in output.element && typeof output.element.value === 'string') {
          return output.element.value
        }

        return ''
      default:
        return getElementOuterHTML(output.element)
    }
  }

  // Inline markup (text entities and inline decorators) exports through the
  // same per-node exportDOM dispatch the cards get, with the options bag
  // flowing so headless renders resolve their DOM. The base-class exportDOM
  // signature takes no options parameter; inkling's inline exporters
  // (FootnoteRefNode/MathInlineNode) declare the two-parameter form this
  // assertion names — it is load-bearing (removing it is a TS2554 on the
  // call below).
  function exportInlineMarkup(node: LexicalNode): string {
    const exporter = node as LexicalNode & {
      exportDOM(editor: LexicalEditor, options?: ExportDOMOptions): DOMExportOutput & { type?: ExportDOMOutputType }
    }
    return renderExportOutput(exporter.exportDOM(editor, options))
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
      // element/decorator children flush the pending text run — inline
      // markup entities are TextNodes and flush in their own branch below
      // instead
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
        // A TextNode entity whose export is element markup (`<sup><a…>`), not
        // text — flush the pending run here (the pre-loop flush never sees
        // it: entities ARE TextNodes) and splice the export like the
        // inline-decorator branch below.
        if (!textContent.isEmpty()) {
          output.push(textContent.render())
          textContent.clear()
        }
        output.push(exportInlineMarkup(child))
      } else if ($isLineBreakNode(child) || $isTextNode(child) || $isLinkNode(child)) {
        textContent.addNode(child)
      } else if ($isDecoratorNode(child) && child.isInline()) {
        // Inline decorators (the math inline node is the first) splice into
        // the text flow through the same exportDOM dispatch.
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
  // null results (bare inline nodes as root children, :65) never reach
  // output, so children indices and output indices diverge — keep the map
  // for the trailing-paragraph splice below. Dev Lexical rejects such trees
  // at RootNode.splice, but prod builds strip that guard, so a malformed
  // headless import can still produce them there.
  const outputIndexByChild: number[] = []

  for (const child of children) {
    const result = exportTopLevelElementOrDecorator(child)

    outputIndexByChild.push(result === null ? -1 : output.length)
    if (result !== null) {
      output.push(result)
    }
  }

  // Inkling keeps a blank paragraph at the end of a doc but we want to
  // make sure it doesn't get rendered. A post-processor's doc-end trailing
  // run (the footnote definition run) sits after it, so walk back past the
  // claimed run nodes to the last prose element before checking.
  let lastProseIndex = children.length - 1
  while (lastProseIndex >= 0 && isTrailingRunNode(children[lastProseIndex])) {
    lastProseIndex -= 1
  }
  const lastProse = children[lastProseIndex]
  if (lastProse && $isParagraphNode(lastProse) && lastProse.getTextContent().trim() === '') {
    // splice by the output-side index — a paragraph always exports non-null,
    // so its mapped index is the entry to remove
    output.splice(outputIndexByChild[lastProseIndex], 1)
  }

  // Declarative post-processing: each subsystem's registered post-processor
  // gets one pass over the assembled outputs (the footnotes `<section>` wrap
  // lives in `@/nodes/footnote/footnote-html-export`).
  for (const processor of HTML_POST_PROCESSORS) {
    processor.process({ children, output, context })
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
