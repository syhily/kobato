import { $generateHtmlFromNodes } from '@lexical/html'
import { createCommand } from 'lexical'

import CodeBlockIcon from '@/ui/inkling-editor/assets/icons/inkling-card-type-gen-embed.svg?react'
import { cleanBasicHtml } from '@/ui/inkling-editor/html/clean-basic-html'
import { InklingCardWrapper, MINIMAL_NODES } from '@/ui/inkling-editor/index'
import { CodeBlockNode as BaseCodeBlockNode } from '@/ui/inkling-editor/nodes/base'
import { CodeBlockNodeComponent } from '@/ui/inkling-editor/nodes/CodeBlockNodeComponent'
import { populateNestedEditor, setupNestedEditor } from '@/ui/inkling-editor/utils/nested-editors'

export const INSERT_CODE_BLOCK_COMMAND = createCommand()

export class CodeBlockNode extends BaseCodeBlockNode {
  // transient properties used to control node behaviour
  __openInEditMode = false
  __captionEditor!: import('lexical').LexicalEditor | null
  __captionEditorInitialState!: import('lexical').EditorState | undefined

  // oxlint-disable-next-line typescript/no-explicit-any
  constructor(dataset: Record<string, any> = {}, key?: string) {
    super(dataset, key)

    const { _openInEditMode } = dataset
    this.__openInEditMode = _openInEditMode || false

    setupNestedEditor(this, '__captionEditor', { editor: dataset.captionEditor, nodes: MINIMAL_NODES })

    // populate nested editors on initial construction
    if (!dataset.captionEditor && dataset.caption) {
      populateNestedEditor(this, '__captionEditor', `${dataset.caption}`) // we serialize with no wrapper
    }
  }

  getIcon() {
    return CodeBlockIcon
  }

  clearOpenInEditMode() {
    const self = this.getWritable()
    self.__openInEditMode = false
  }

  getDataset() {
    const dataset = super.getDataset()

    // client-side only data properties such as nested editors
    const self = this.getLatest()
    dataset.captionEditor = self.__captionEditor
    dataset.captionEditorInitialState = self.__captionEditorInitialState

    return dataset
  }

  exportJSON() {
    const json = super.exportJSON()

    // convert nested editor instances back into HTML because their content may not
    // be automatically updated when the nested editor changes
    if (this.__captionEditor) {
      this.__captionEditor.getEditorState().read(() => {
        const html = $generateHtmlFromNodes(this.__captionEditor!, null)
        const cleanedHtml = cleanBasicHtml(html)
        json.caption = cleanedHtml
      })
    }

    return json
  }

  decorate() {
    return (
      <InklingCardWrapper nodeKey={this.getKey()} wrapperStyle="code-card">
        <CodeBlockNodeComponent
          captionEditor={this.__captionEditor}
          captionEditorInitialState={this.__captionEditorInitialState}
          code={this.code}
          language={this.language}
          nodeKey={this.getKey()}
        />
      </InklingCardWrapper>
    )
  }
}

// oxlint-disable-next-line typescript/no-explicit-any
export function $createCodeBlockNode(dataset: Record<string, any>) {
  return new CodeBlockNode(dataset)
}

export function $isCodeBlockNode(node: unknown) {
  return node instanceof CodeBlockNode
}
