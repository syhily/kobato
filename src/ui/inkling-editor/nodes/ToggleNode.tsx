import { $generateHtmlFromNodes } from '@lexical/html'
import { $canShowPlaceholderCurry } from '@lexical/text'
import { createCommand, type EditorState, type LexicalEditor, type SerializedLexicalNode } from 'lexical'

import ToggleIcon from '@/ui/inkling-editor/assets/icons/inkling-card-type-toggle.svg?react'
import InklingCardWrapper from '@/ui/inkling-editor/components/InklingCardWrapper'
import { cleanBasicHtml } from '@/ui/inkling-editor/html/clean-basic-html'
import { ToggleNode as BaseToggleNode } from '@/ui/inkling-editor/nodes/base'
import MINIMAL_NODES from '@/ui/inkling-editor/nodes/MinimalNodes'
import { ToggleNodeComponent } from '@/ui/inkling-editor/nodes/ToggleNodeComponent'
import { populateNestedEditor, setupNestedEditor } from '@/ui/inkling-editor/utils/nested-editors'

export const INSERT_TOGGLE_COMMAND = createCommand('INSERT_TOGGLE_COMMAND')

interface ToggleDataset {
  titleEditor?: LexicalEditor
  contentEditor?: LexicalEditor
  heading?: string
  content?: string
  [key: string]: unknown
}

export class ToggleNode extends BaseToggleNode {
  __titleEditor!: LexicalEditor | null
  __titleEditorInitialState!: EditorState | undefined
  __contentEditor!: LexicalEditor | null
  __contentEditorInitialState!: EditorState | undefined

  static kgMenu = [
    {
      label: 'Toggle',
      desc: 'Collapsible content block',
      Icon: ToggleIcon,
      insertCommand: INSERT_TOGGLE_COMMAND,
      insertParams: {},
      matches: ['toggle', 'collapsible', 'accordion'],
      priority: 16,
      shortcut: '/toggle',
    },
  ]

  constructor(dataset: ToggleDataset = {}, key?: string) {
    // oxlint-disable-next-line typescript/no-explicit-any
    super(dataset as Partial<Record<string, unknown>>, key)

    setupNestedEditor(this, '__titleEditor', { editor: dataset.titleEditor, nodes: MINIMAL_NODES })
    setupNestedEditor(this, '__contentEditor', { editor: dataset.contentEditor, nodes: MINIMAL_NODES })

    if (!dataset.titleEditor && dataset.heading) {
      populateNestedEditor(this, '__titleEditor', `${dataset.heading}`)
    }

    if (!dataset.contentEditor && dataset.content) {
      populateNestedEditor(this, '__contentEditor', `${dataset.content}`)
    }
  }

  getIcon() {
    return ToggleIcon
  }

  isEmpty() {
    const isTitleEmpty = this.__titleEditor!.getEditorState().read($canShowPlaceholderCurry(false))
    const isContentEmpty = this.__contentEditor!.getEditorState().read($canShowPlaceholderCurry(false))
    return isTitleEmpty && isContentEmpty
  }

  getDataset() {
    const dataset = super.getDataset() as Record<string, unknown>
    const self = this.getLatest()

    dataset.titleEditor = self.__titleEditor
    dataset.titleEditorInitialState = self.__titleEditorInitialState
    dataset.contentEditor = self.__contentEditor
    dataset.contentEditorInitialState = self.__contentEditorInitialState

    return dataset
  }

  exportJSON() {
    const json: Record<string, unknown> = super.exportJSON() as Record<string, unknown>

    if (this.__titleEditor) {
      this.__titleEditor.getEditorState().read(() => {
        const html = $generateHtmlFromNodes(this.__titleEditor as LexicalEditor, null)
        const cleanedHtml = cleanBasicHtml(html, { firstChildInnerContent: true, allowBr: true })
        json.heading = cleanedHtml
      })
    }

    if (this.__contentEditor) {
      this.__contentEditor.getEditorState().read(() => {
        const html = $generateHtmlFromNodes(this.__contentEditor as LexicalEditor, null)
        const cleanedHtml = cleanBasicHtml(html, { allowBr: true })
        json.content = cleanedHtml
      })
    }

    // oxlint-disable-next-line typescript/no-explicit-any
    return json as any as SerializedLexicalNode
  }

  decorate() {
    const self = this as unknown as { title?: string }
    return (
      <InklingCardWrapper nodeKey={this.getKey()} width="regular">
        {/* oxlint-disable-next-line typescript/no-explicit-any */}
        <ToggleNodeComponent
          {...({
            contentEditor: this.__contentEditor!,
            contentEditorInitialState: this.__contentEditorInitialState,
            nodeKey: this.getKey(),
            title: (self.title as string) ?? '',
            headingEditor: this.__titleEditor,
            headingEditorInitialState: this.__titleEditorInitialState,
            // oxlint-disable-next-line typescript/no-explicit-any
          } as any)}
        />
      </InklingCardWrapper>
    )
  }
}

export const $createToggleNode = (dataset?: ToggleDataset): ToggleNode => {
  return new ToggleNode(dataset)
}

export function $$isisToggleNode(node: unknown): boolean {
  return node instanceof ToggleNode
}
