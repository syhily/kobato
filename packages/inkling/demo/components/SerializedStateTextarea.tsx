import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import React from 'react'

interface SerializedStateTextareaProps {
  isOpen: boolean
}

const SerializedStateTextarea = ({ isOpen }: SerializedStateTextareaProps) => {
  const [editor] = useLexicalComposerContext()

  const renderEditorState = () => JSON.stringify(editor.getEditorState().toJSON(), null, 2)

  const [serializedJson, setSerializedJson] = React.useState(renderEditorState())

  const onChange = () => {
    setSerializedJson(renderEditorState())
  }

  return (
    <>
      <pre className="size-full resize-none !overflow-auto bg-black !p-4 font-mono text-sm text-grey-300 selection:bg-grey-800">
        {isOpen && <code>{serializedJson}</code>}
      </pre>
      <OnChangePlugin onChange={onChange} />
    </>
  )
}

export default SerializedStateTextarea
