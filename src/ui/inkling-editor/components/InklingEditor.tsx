import '@/ui/inkling-editor/styles/index.css'
import React from 'react'

import InklingComposableEditor from '@/ui/inkling-editor/components/InklingComposableEditor'
import { SharedHistoryContext } from '@/ui/inkling-editor/context/SharedHistoryContext'
import { SharedOnChangeContext } from '@/ui/inkling-editor/context/SharedOnChangeContext'
import { AllDefaultPlugins } from '@/ui/inkling-editor/plugins/AllDefaultPlugins'

interface InklingEditorProps {
  onChange?: (editorState: unknown) => void
  children?: React.ReactNode
  [key: string]: unknown
}

const InklingEditor = ({ onChange, children, ...props }: InklingEditorProps) => {
  return (
    <SharedHistoryContext>
      <SharedOnChangeContext onChange={onChange}>
        <InklingComposableEditor {...props}>
          <AllDefaultPlugins />
          {children}
        </InklingComposableEditor>
      </SharedOnChangeContext>
    </SharedHistoryContext>
  )
}

export default InklingEditor
