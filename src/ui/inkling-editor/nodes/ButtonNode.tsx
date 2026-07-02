import { $generateHtmlFromNodes } from '@lexical/html'
import { createCommand, type EditorState, type LexicalEditor, type SerializedLexicalNode } from 'lexical'

import ButtonCardIcon from '@/ui/inkling-editor/assets/icons/inkling-card-type-button.svg?react'
import InklingCardWrapper from '@/ui/inkling-editor/components/InklingCardWrapper'
import { cleanBasicHtml } from '@/ui/inkling-editor/html/clean-basic-html'
import { ButtonNode as BaseButtonNode } from '@/ui/inkling-editor/nodes/base'
import { ButtonNodeComponent } from '@/ui/inkling-editor/nodes/ButtonNodeComponent'
import MINIMAL_NODES from '@/ui/inkling-editor/nodes/MinimalNodes'
import { populateNestedEditor, setupNestedEditor } from '@/ui/inkling-editor/utils/nested-editors'

export const INSERT_BUTTON_COMMAND = createCommand('INSERT_BUTTON_COMMAND')

interface ButtonDataset {
  textEditor?: LexicalEditor
  text?: string
  [key: string]: unknown
}

export class ButtonNode extends BaseButtonNode {
  __textEditor!: LexicalEditor | null
  __textEditorInitialState!: EditorState | undefined

  static kgMenu = [
    {
      label: 'Button',
      desc: 'Call-to-action button',
      Icon: ButtonCardIcon,
      insertCommand: INSERT_BUTTON_COMMAND,
      insertParams: {},
      matches: ['button', 'btn'],
      priority: 16,
      shortcut: '/button',
    },
  ]

  constructor(dataset: ButtonDataset = {}, key?: string) {
    // oxlint-disable-next-line typescript/no-explicit-any
    super(dataset as Partial<Record<string, unknown>>, key)

    setupNestedEditor(this, '__textEditor', { editor: dataset.textEditor, nodes: MINIMAL_NODES })

    if (!dataset.textEditor && dataset.text) {
      populateNestedEditor(this, '__textEditor', `${dataset.text}`)
    }
  }

  getIcon() {
    return ButtonCardIcon
  }

  getDataset() {
    const dataset = super.getDataset() as Record<string, unknown>
    const self = this.getLatest()

    dataset.textEditor = self.__textEditor
    dataset.textEditorInitialState = self.__textEditorInitialState

    return dataset
  }

  exportJSON() {
    const json: Record<string, unknown> = super.exportJSON() as Record<string, unknown>

    if (this.__textEditor) {
      this.__textEditor.getEditorState().read(() => {
        const html = $generateHtmlFromNodes(this.__textEditor as LexicalEditor, null)
        const cleanedHtml = cleanBasicHtml(html, { firstChildInnerContent: true, allowBr: true })
        json.text = cleanedHtml
      })
    }

    // oxlint-disable-next-line typescript/no-explicit-any
    return json as any as SerializedLexicalNode
  }

  decorate() {
    return (
      <InklingCardWrapper nodeKey={this.getKey()} width="regular">
        <ButtonNodeComponent
          alignment={this.alignment ?? 'center'}
          buttonText={this.buttonText ?? ''}
          buttonUrl={this.buttonUrl ?? ''}
          nodeKey={this.getKey()}
        />
      </InklingCardWrapper>
    )
  }
}

export const $createButtonNode = (dataset?: ButtonDataset): ButtonNode => {
  return new ButtonNode(dataset)
}

export function $$isisButtonNode(node: unknown): boolean {
  return node instanceof ButtonNode
}
