import { useCardPickerState, useCardPickerStore } from '@kobato/inkling-internal/context/CardPickerStoreContext'
import { resolveCardPicker } from '@kobato/inkling-internal/nodes/cards/host-card-registry'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'
import React from 'react'

export function CardPickerHostPlugin() {
  const [editor] = useLexicalComposerContext()
  const store = useCardPickerStore()
  const request = useCardPickerState((state) => state.request)

  const picker = request === null ? undefined : resolveCardPicker(request.nodeType)
  React.useEffect(() => {
    if (request === null) {
      return
    }
    const nodeExists = editor.getEditorState().read(() => $getNodeByKey(request.nodeKey) !== null)
    if (!nodeExists) {
      store.setState({ request: null })
      return
    }
    return editor.registerUpdateListener(({ editorState }) => {
      const nodeStillExists = editorState.read(() => $getNodeByKey(request.nodeKey) !== null)
      if (!nodeStillExists) {
        store.setState({ request: null })
      }
    })
  }, [editor, request, store])

  React.useEffect(() => {
    return () => {
      store.setState({ request: null })
    }
  }, [store])

  React.useEffect(() => {
    if (request !== null && picker === undefined) {
      store.setState({ request: null })
    }
  }, [request, picker, store])

  if (request === null || picker === undefined) {
    return null
  }

  return (
    <React.Fragment key={request.nodeKey}>
      {picker.render({
        editor,
        nodeKey: request.nodeKey,
        close: () => store.setState({ request: null }),
        fromInsert: request.fromInsert === true,
      })}
    </React.Fragment>
  )
}

export default CardPickerHostPlugin
