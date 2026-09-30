import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'
import React from 'react'

import { useCardPickerState, useCardPickerStore } from '@/inkling/context/CardPickerStoreContext'
import { resolveCardPicker } from '@/inkling/nodes/cards/host-card-registry'

/**
 * The pick seam's dispatch half (CONTEXT.md: "pick seam"): one generic picker
 * host on the editor surface (a CORE_PLUGINS entry, non-nested surfaces only
 * — nested composers share the top-level handle, so a nested mount would
 * render the active picker twice). It subscribes to the per-composer pick
 * request store, resolves the node type's picker through the registry's
 * single channel (`resolveCardPicker` — host spec fact or built-in-variant
 * override), and mounts `picker.render(...)` exactly once for the active
 * request. The `close` prop and a node-deleted update both drop the request.
 */
export function CardPickerHostPlugin() {
  const [editor] = useLexicalComposerContext()
  const store = useCardPickerStore()
  const request = useCardPickerState((state) => state.request)

  // The registry read is pure — resolve during render so the effect below
  // can drop requests whose picker is gone (the writers already gate on a
  // registered picker, so this only fires for one unregistered mid-session).
  const picker = request === null ? undefined : resolveCardPicker(request.nodeType)

  // A card deleted while its picker is open strands the dialog on a dead key
  // — drop the request on the first update that loses the node.
  React.useEffect(() => {
    if (request === null) {
      return
    }
    return editor.registerUpdateListener(({ editorState }) => {
      const nodeExists = editorState.read(() => $getNodeByKey(request.nodeKey) !== null)
      if (!nodeExists) {
        store.setState({ request: null })
      }
    })
  }, [editor, request, store])

  React.useEffect(() => {
    if (request !== null && picker === undefined) {
      store.setState({ request: null })
    }
  }, [request, picker, store])

  if (request === null || picker === undefined) {
    return null
  }
  // Keyed on the request's node key so a reopened pick mounts a fresh dialog.
  return (
    <React.Fragment key={request.nodeKey}>
      {picker.render({ editor, nodeKey: request.nodeKey, close: () => store.setState({ request: null }) })}
    </React.Fragment>
  )
}

export default CardPickerHostPlugin
