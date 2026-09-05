import type { LexicalEditor, LexicalNode } from 'lexical'

import type { DecoratorNodeProperty } from '@/nodes/base/card-specs'
import type { ExportDOMOptions } from '@/nodes/base/export-dom'

import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
} from '@/nodes/base/generate-decorator-node'
import { parseFootnoteDefinitionSection } from '@/nodes/base/nodes/footnotedefinition/footnotedefinition-parser'
import { renderFootnoteDefinitionNode } from '@/nodes/base/nodes/footnotedefinition/footnotedefinition-renderer'
import { createRenderContext } from '@/nodes/base/render-context'

const footnoteDefinitionProperties = [
  { name: 'content', default: '', urlType: 'html' },
  { name: 'targetKey', default: '' },
] as const satisfies readonly DecoratorNodeProperty[]

export type FootnoteDefinitionData = DecoratorNodeData<typeof footnoteDefinitionProperties>

export interface BaseFootnoteDefinitionNode extends DecoratorNodeValueMap<typeof footnoteDefinitionProperties> {}

/**
 * The footnote definition (CONTEXT.md: footnote definition) — a menu-less
 * card living in the doc-end definition run. Unlike kobato (which keeps
 * definitions in editor-external parallel state and merge/strips them on
 * every update), the definition is a real node here: `onChange` carries the
 * whole footnote state and the export layout falls out of the tree. The
 * `content` property is the nested editor's serialized HTML; `targetKey`
 * cross-references the citing refs (kobato's definition `_key`).
 */
export class BaseFootnoteDefinitionNode extends generateDecoratorNode({
  nodeType: 'footnotedefinition',
  properties: footnoteDefinitionProperties,
  // No defaultRenderFn: the renderer needs the position-derived index, which
  // only the subclass-typed `this` can supply — exportDOM is overridden
  // below instead (the generated one would throw without a render fn).
  hasEditMode: false,
}) {
  // The generated constructor assigns nested editors only on subclasses that
  // adopt a `nestedEditors` spec (the assembled card class); a raw
  // `new BaseFootnoteDefinitionNode()` leaves it unset — same honest-field
  // idiom as BaseToggleNode's editor declarations.
  declare __contentEditor: LexicalEditor | null | undefined

  static importDOM() {
    return parseFootnoteDefinitionSection(this)
  }

  // The 1-based citation index is a render-time derivative of the node's
  // rank inside the doc-end definition run — the renumber engine keeps the
  // run ordered, so position IS the index and no stored field can drift.
  getFootnoteIndex(): number {
    let index = 1
    let sibling: LexicalNode | null = this.getPreviousSibling()
    while (sibling) {
      if ($isFootnoteDefinitionNode(sibling)) {
        index += 1
      }
      sibling = sibling.getPreviousSibling()
    }
    return index
  }

  exportJSON() {
    // kobato wire alignment: the definition carries its precomputed `index`
    // on save — derived here, at export, from the node's rank in the run.
    return { ...super.exportJSON(), index: this.getFootnoteIndex() }
  }

  // The defaultRenderFn slot stays empty: the renderer needs the
  // position-derived index, and the generated instance type cannot name this
  // subclass method — so exportDOM is overridden here where `this` carries
  // it. Same call shape as the generated exportDOM (context per export).
  exportDOM(_editor: LexicalEditor, options: ExportDOMOptions = {}) {
    return renderFootnoteDefinitionNode(this, createRenderContext(options))
  }
}

export const $createBaseFootnoteDefinitionNode = (dataset: FootnoteDefinitionData = {}) => {
  return new BaseFootnoteDefinitionNode(dataset)
}

export function $isFootnoteDefinitionNode(node: unknown): node is BaseFootnoteDefinitionNode {
  return node instanceof BaseFootnoteDefinitionNode
}
