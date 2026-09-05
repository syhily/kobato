import type { HeadingTagType, SerializedHeadingNode } from '@lexical/rich-text'
import type { DOMConversion } from 'lexical'

import { HeadingNode } from '@lexical/rich-text'

// the aria-level → tag mapping as data: HEADING_TAGS[level - 1], no assertion
const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const satisfies readonly HeadingTagType[]

// Since the HeadingNode is foundational to Lexical rich-text, only using a
// custom HeadingNode is undesirable as it means every package would need to
// be updated to work with the custom node. Instead we can use Lexical's node
// override/replacement mechanism to extend the default with our custom parsing
// logic.
//
// https://lexical.dev/docs/concepts/serialization#handling-extended-html-styling

export const extendedHeadingNodeReplacement = {
  replace: HeadingNode,
  with: (node: HeadingNode) => new ExtendedHeadingNode(node.__tag),
}

export class ExtendedHeadingNode extends HeadingNode {
  constructor(tag: HeadingTagType, key?: string) {
    super(tag, key)
  }

  static getType() {
    return 'extended-heading'
  }

  static clone(node: ExtendedHeadingNode) {
    return new ExtendedHeadingNode(node.__tag, node.__key)
  }

  static importDOM() {
    const importers = HeadingNode.importDOM()
    return {
      ...importers,
      p: patchParagraphConversion(importers?.p),
    }
  }

  static importJSON(serializedNode: SerializedHeadingNode): ExtendedHeadingNode {
    // construct our own class (the sibling ExtendedQuoteNode pattern):
    // updateFromJSON restores the full element-level shape (textFormat /
    // textStyle included), which the manual setFormat/setIndent/setDirection
    // trio dropped
    return new ExtendedHeadingNode(serializedNode.tag).updateFromJSON(serializedNode)
  }

  exportJSON() {
    const json = super.exportJSON()
    json.type = 'extended-heading'
    return json
  }
}

type DOMConverterFn = ((node: HTMLElement) => DOMConversion | null) | undefined

function patchParagraphConversion(originalDOMConverter: DOMConverterFn) {
  return (node: HTMLElement) => {
    // Original matches Google Docs p node to a null conversion so it's
    // child span is parsed as a heading. Don't prevent that here
    const original = originalDOMConverter?.(node)
    if (original) {
      return original
    }

    const p = node

    // Word uses paragraphs with role="heading" to represent headings
    // and an aria-level="x" to represent the heading level
    const hasAriaHeadingRole = p.getAttribute('role') === 'heading'
    const hasAriaLevel = p.getAttribute('aria-level')

    if (hasAriaHeadingRole && hasAriaLevel) {
      const level = parseInt(hasAriaLevel, 10)
      const tag = HEADING_TAGS[level - 1]
      if (level > 0 && level < 7 && tag) {
        return {
          conversion: () => {
            return {
              node: new ExtendedHeadingNode(tag),
            }
          },
          priority: 1 as const,
        }
      }
    }

    return null
  }
}
