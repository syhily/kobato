import type { HeadingTagType, SerializedHeadingNode } from '@lexical/rich-text'
import type { DOMConversion } from 'lexical'

import { HeadingNode } from '@lexical/rich-text'

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const satisfies readonly HeadingTagType[]

export class ExtendedHeadingNode extends HeadingNode {
  static getType() {
    return 'extended-heading'
  }

  static clone(node: ExtendedHeadingNode) {
    return new ExtendedHeadingNode(node.__tag, node.__key)
  }

  static importDOM() {
    const importers = HeadingNode.importDOM?.()
    return {
      ...importers,
      p: patchParagraphConversion(importers?.p),
    }
  }

  static importJSON(serializedNode: SerializedHeadingNode): ExtendedHeadingNode {
    return new ExtendedHeadingNode(serializedNode.tag).updateFromJSON(serializedNode)
  }

  exportJSON() {
    const json = super.exportJSON()
    json.type = 'extended-heading'
    return json
  }
}

export const extendedHeadingNodeReplacement = {
  replace: HeadingNode,
  with: (node: HeadingNode) => new ExtendedHeadingNode(node.__tag),
  withKlass: ExtendedHeadingNode,
}

type DOMConverterFn = ((node: HTMLElement) => DOMConversion | null) | undefined

function patchParagraphConversion(originalDOMConverter: DOMConverterFn) {
  return (node: HTMLElement) => {
    const original = originalDOMConverter?.(node)
    if (original) {
      return original
    }

    const p = node

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
