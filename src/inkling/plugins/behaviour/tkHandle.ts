import { createComposerHandle, type ComposerHandle } from '@/inkling/plugins/behaviour/composer-handle'
import { throttle } from '@/inkling/utils'

// Editor-side handle for the per-top-level-composer tk channel, built on the
// composer handle factory. Owns the per-editor map of TK node keys plus the
// throttled derivation of the top-level tkNodeMap/tkCount used to render
// indicators, so TKPlugin's Lexical mutation listeners read and write
// synchronously instead of closing over a stale React mirror. Fed by
// TKPlugin's mutation listener and unmount cleanup; React subscribes
// render-only via useTKHandleState. One instance per top-level composer
// (created in InklingComposer); nested composers share the top-level handle.

export interface TKHandleState {
  tkNodeMap: Record<string, string[]>
  tkCount: number
}

export interface TKHandle extends ComposerHandle<TKHandleState> {
  addEditorTkNode: (editorKey: string, topLevelNodeKey: string, tkNodeKey: string) => void
  removeEditorTkNode: (editorKey: string, tkNodeKey: string) => void
  removeEditor: (editorKey: string) => void
}

export function createTKHandle(): TKHandle {
  const handle = createComposerHandle<TKHandleState>({ tkNodeMap: {}, tkCount: 0 })

  // Map(
  //   editorKey: Map(
  //     tkNodeKey: {topLevelNodeKey}
  //   )
  // )
  //
  // Stored under the editor key because a top-level node (i.e. a decorator)
  // may contain multiple nested editors; the plugin in each editor only knows
  // its own nodes.
  const editorTkNodeMap = new Map<string, Map<string, { topLevelNodeKey: string }>>()

  // Throttled: add/remove fire many times in succession when the editor opens
  // or large blocks of TK-containing content are added/removed (delete, undo).
  const updateTkNodeMap = throttle(
    () => {
      const tkNodeMap: Record<string, string[]> = {}
      let tkCount = 0

      editorTkNodeMap.forEach((nodeMap) => {
        nodeMap.forEach(({ topLevelNodeKey }, tkNodeKey) => {
          tkCount = tkCount + 1

          if (tkNodeMap[topLevelNodeKey] === undefined) {
            tkNodeMap[topLevelNodeKey] = [tkNodeKey]
          } else {
            tkNodeMap[topLevelNodeKey].push(tkNodeKey)
          }
        })
      })

      handle.setState({ tkNodeMap, tkCount })
    },
    5,
    { trailing: true },
  )

  return {
    ...handle,

    addEditorTkNode(editorKey, topLevelNodeKey, tkNodeKey) {
      const tkNodes = editorTkNodeMap.get(editorKey) ?? new Map<string, { topLevelNodeKey: string }>()
      editorTkNodeMap.set(editorKey, tkNodes)

      tkNodes.set(tkNodeKey, { topLevelNodeKey })

      updateTkNodeMap()
    },

    removeEditorTkNode(editorKey, tkNodeKey) {
      editorTkNodeMap.get(editorKey)?.delete(tkNodeKey)

      if (editorTkNodeMap.get(editorKey)?.size === 0) {
        editorTkNodeMap.delete(editorKey)
      }

      updateTkNodeMap()
    },

    removeEditor(editorKey) {
      editorTkNodeMap.delete(editorKey)

      updateTkNodeMap()
    },
  }
}
