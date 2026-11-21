import type { DOMConversion, LexicalNode, SerializedTextNode } from 'lexical'

import { $isTextNode, TextNode } from 'lexical'

export class ExtendedTextNode extends TextNode {
  static getType() {
    return 'extended-text'
  }

  static clone(node: ExtendedTextNode) {
    return new ExtendedTextNode(node.__text, node.__key)
  }

  static importDOM() {
    const importers = TextNode.importDOM?.()
    return {
      ...importers,
      span: () => ({
        conversion: patchConversion(importers?.span, convertSpanElement),
        priority: 1 as const,
      }),
    }
  }

  static importJSON(serializedNode: SerializedTextNode): ExtendedTextNode {
    return new ExtendedTextNode(serializedNode.text).updateFromJSON(serializedNode)
  }

  exportJSON() {
    const json = super.exportJSON()
    json.type = 'extended-text'
    return json
  }

  isSimpleText(): boolean {
    return this.__type === 'extended-text' && this.__mode === 0
  }

  isInline(): true {
    return true
  }
}

export const extendedTextNodeReplacement = {
  replace: TextNode,
  with: (node: TextNode) => new ExtendedTextNode(node.__text),
  withKlass: ExtendedTextNode,
}

type DOMConverterFn = ((node: HTMLElement) => DOMConversion | null) | undefined

function patchConversion(
  originalDOMConverter: DOMConverterFn,
  convertFn: (lexicalNode: TextNode, domNode: HTMLElement) => TextNode,
) {
  return (node: HTMLElement) => {
    const original = originalDOMConverter?.(node)
    if (!original) {
      return null
    }
    const originalOutput = original.conversion(node)

    if (!originalOutput) {
      return originalOutput
    }

    return {
      ...originalOutput,
      forChild: (lexicalNode: LexicalNode, parent: LexicalNode | null | undefined) => {
        const originalForChild = originalOutput.forChild ?? ((x: LexicalNode) => x)
        const result = originalForChild(lexicalNode, parent)
        if ($isTextNode(result)) {
          return convertFn(result, node)
        }
        return result
      },
    }
  }
}

function convertSpanElement(lexicalNode: TextNode, domNode: HTMLElement) {
  const span = domNode

  const hasBoldFontWeight = span.style.fontWeight === 'bold' || span.parentElement?.style.fontWeight === 'bold'
  const hasItalicFontStyle = span.style.fontStyle === 'italic' || span.parentElement?.style.fontStyle === 'italic'
  const hasUnderlineTextDecoration =
    span.style.textDecoration === 'underline' || span.parentElement?.style.textDecoration === 'underline'
  const hasStrikethroughClass =
    span.classList.contains('Strikethrough') || span.parentElement?.classList.contains('Strikethrough')
  const hasHighlightClass = span.classList.contains('Highlight') || span.parentElement?.classList.contains('Highlight')

  let node = lexicalNode

  if (hasBoldFontWeight && !node.hasFormat('bold')) {
    node = node.toggleFormat('bold')
  }

  if (hasItalicFontStyle && !node.hasFormat('italic')) {
    node = node.toggleFormat('italic')
  }

  if (hasUnderlineTextDecoration && !node.hasFormat('underline')) {
    node = node.toggleFormat('underline')
  }

  if (hasStrikethroughClass && !node.hasFormat('strikethrough')) {
    node = node.toggleFormat('strikethrough')
  }

  if (hasHighlightClass && !node.hasFormat('highlight')) {
    node = node.toggleFormat('highlight')
  }

  return node
}
