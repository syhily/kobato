import type {
  DecoratorNodeProperty,
  NestedEditorFieldMap,
  NestedEditorSpec,
} from '@kobato/inkling-internal/nodes/base/card-specs'
import type { ExportDOMOptions } from '@kobato/inkling-internal/nodes/base/export-dom'
import type { LexicalEditor, LexicalNode } from 'lexical'

import {
  generateDecoratorNode,
  type DecoratorNodeData,
} from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
import { parseFootnoteDefinitionSection } from '@kobato/inkling-internal/nodes/base/nodes/footnotedefinition/footnotedefinition-parser'
import { renderFootnoteDefinitionNode } from '@kobato/inkling-internal/nodes/base/nodes/footnotedefinition/footnotedefinition-renderer'
import { createRenderContext } from '@kobato/inkling-internal/nodes/base/render-context'
import BASIC_NODES from '@kobato/inkling-internal/nodes/BasicNodes'

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

// oxlint-disable-next-line typescript/no-empty-object-type -- class+interface merging: self-types the spec-driven fields
export interface BaseFootnoteDefinitionNode extends NestedEditorFieldMap<typeof footnoteDefinitionNestedEditors> {}
export class BaseFootnoteDefinitionNode extends generateDecoratorNode({
  nodeType: 'footnotedefinition',
  properties: footnoteDefinitionProperties,
  hasEditMode: false,
}) {
  static importDOM() {
    return parseFootnoteDefinitionSection(this)
  }

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
    return { ...super.exportJSON(), index: this.getFootnoteIndex() }
  }

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
