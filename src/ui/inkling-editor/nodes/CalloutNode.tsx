import { $generateHtmlFromNodes } from '@lexical/html'
import { createCommand } from 'lexical'

import CalloutCardIcon from '@/ui/inkling-editor/assets/icons/inkling-card-type-callout.svg?react'
import InklingCardWrapper from '@/ui/inkling-editor/components/InklingCardWrapper'
import { cleanBasicHtml } from '@/ui/inkling-editor/html/clean-basic-html'
import { CalloutNode as BaseCalloutNode } from '@/ui/inkling-editor/nodes/base'
import { CalloutNodeComponent } from '@/ui/inkling-editor/nodes/CalloutNodeComponent'
import MINIMAL_NODES from '@/ui/inkling-editor/nodes/MinimalNodes'
import { populateNestedEditor, setupNestedEditor } from '@/ui/inkling-editor/utils/nested-editors'

export const INSERT_CALLOUT_COMMAND = createCommand()

export class CalloutNode extends BaseCalloutNode {
  __calloutTextEditor!: import('lexical').LexicalEditor | null
  __calloutTextEditorInitialState!: import('lexical').EditorState | undefined

  static kgMenu = [
    {
      label: 'Callout',
      desc: 'Info boxes that stand out',
      Icon: CalloutCardIcon,
      insertCommand: INSERT_CALLOUT_COMMAND,
      matches: ['callout'],
      priority: 9,
      shortcut: '/callout',
    },
  ]

  getIcon() {
    return CalloutCardIcon
  }

  // oxlint-disable-next-line typescript/no-explicit-any
  constructor(dataset: Record<string, any> = {}, key?: string) {
    super(dataset, key)

    // set up nested editor instances
    setupNestedEditor(this, '__calloutTextEditor', { editor: dataset.calloutTextEditor, nodes: MINIMAL_NODES })

    // populate nested editors on initial construction
    if (!dataset.calloutTextEditor && dataset.calloutText) {
      populateNestedEditor(this, '__calloutTextEditor', `${dataset.calloutText}`) // we serialize with no wrapper
    }
  }

  exportJSON() {
    const json = super.exportJSON()

    // convert nested editor instance back into HTML because `text` may not
    // be automatically updated when the nested editor changes
    if (this.__calloutTextEditor) {
      this.__calloutTextEditor.getEditorState().read(() => {
        const html = $generateHtmlFromNodes(this.__calloutTextEditor!, null)
        const cleanedHtml = cleanBasicHtml(html, { allowBr: true })
        json.calloutText = cleanedHtml
      })
    }

    return json
  }

  getDataset() {
    const dataset = super.getDataset()
    // client-side only data properties such as nested editors
    const self = this.getLatest()
    dataset.calloutTextEditor = self.__calloutTextEditor
    dataset.calloutTextEditorInitialState = self.__calloutTextEditorInitialState

    return dataset
  }

  decorate() {
    return (
      <InklingCardWrapper nodeKey={this.getKey()}>
        {/* oxlint-disable-next-line typescript/no-explicit-any */}
        <CalloutNodeComponent
          {...({
            backgroundColor: this.backgroundColor,
            calloutEmoji: this.calloutEmoji,
            nodeKey: this.getKey(),
            calloutTextEditor: this.__calloutTextEditor!,
            calloutTextEditorInitialState: this.__calloutTextEditorInitialState,
            // oxlint-disable-next-line typescript/no-explicit-any
          } as any)}
        />
      </InklingCardWrapper>
    )
  }
}

// oxlint-disable-next-line typescript/no-explicit-any
export const $createCalloutNode = (dataset: Record<string, any>) => {
  return new CalloutNode(dataset)
}

export function $isCalloutNode(node: unknown) {
  return node instanceof CalloutNode
}
