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
 * request. The `close` prop, a node-deleted update, and the host's own
 * unmount (e.g. the surface flipping readOnly mid-save) each drop the
 * request — a store write that outlived its host would re-open the picker
 * unprompted on the next mount.
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
  // — drop the request on the first update that loses the node. Read node
  // existence ONCE at registration too: a deletion committed between the
  // store write and this effect's attach is invisible to the forward
  // listener.
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

  // Unmount clears the active request: the surface flips readOnly on every
  // save/publish, unmounting this host — without the cleanup the request
  // survives and the picker pops back unprompted when the save resolves.
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
  // Keyed on the request's node key so a reopened pick mounts a fresh dialog.
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
