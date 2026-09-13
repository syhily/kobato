import type { LexicalEditor, LexicalNode } from 'lexical'

import type { DecoratorNodeProperty, NestedEditorFieldMap, NestedEditorSpec } from '@/inkling/nodes/base/card-specs'
import type { ExportDOMOptions } from '@/inkling/nodes/base/export-dom'

import { generateDecoratorNode, type DecoratorNodeData } from '@/inkling/nodes/base/generate-decorator-node'
import { parseFootnoteDefinitionSection } from '@/inkling/nodes/base/nodes/footnotedefinition/footnotedefinition-parser'
import { renderFootnoteDefinitionNode } from '@/inkling/nodes/base/nodes/footnotedefinition/footnotedefinition-renderer'
import { createRenderContext } from '@/inkling/nodes/base/render-context'
import BASIC_NODES from '@/inkling/nodes/BasicNodes'

// The card's nested-editor spec (CONTEXT.md: "card spec") lives here, beside
// the class it types — the declaration imports it from this module. The
// editor is `nullable`: the headless round-trip invariant detaches it (same
// shape as toggle's). The BASIC_NODES import runs against the layer grain but
// closes no cycle — see the captionEditorSpecBase note.
export const footnoteDefinitionNestedEditors = [
  {
    name: 'contentEditor',
    serializedKey: 'content',
    nodes: BASIC_NODES,
    cleanBasicHtml: { allowBr: true },
    nullable: true,
  },
] as const satisfies readonly NestedEditorSpec[]

const footnoteDefinitionProperties = [
  { name: 'content', default: '', urlType: 'html' },
  { name: 'targetKey', default: '' },
] as const satisfies readonly DecoratorNodeProperty[]

export type FootnoteDefinitionData = DecoratorNodeData<typeof footnoteDefinitionProperties>

/**
 * The footnote definition (CONTEXT.md: footnote definition) — a menu-less
 * card living in the doc-end definition run. Unlike kobato (which keeps
 * definitions in editor-external parallel state and merge/strips them on
 * every update), the definition is a real node here: `onChange` carries the
 * whole footnote state and the export layout falls out of the tree. The
 * `content` property is the nested editor's serialized HTML; `targetKey`
 * cross-references the citing refs (kobato's definition `_key`).
 */
// oxlint-disable-next-line typescript/no-empty-object-type -- class+interface merging: self-types the spec-driven fields
export interface BaseFootnoteDefinitionNode extends NestedEditorFieldMap<typeof footnoteDefinitionNestedEditors> {}
export class BaseFootnoteDefinitionNode extends generateDecoratorNode({
  nodeType: 'footnotedefinition',
  properties: footnoteDefinitionProperties,
  // No defaultRenderFn: the renderer needs the position-derived index, which
  // only the subclass-typed `this` can supply — exportDOM is overridden
  // below instead (the generated one would throw without a render fn).
  hasEditMode: false,
}) {
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
