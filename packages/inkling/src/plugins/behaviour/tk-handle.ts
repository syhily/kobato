import { createComposerHandle, type ComposerHandle } from '@kobato/inkling-internal/plugins/behaviour/composer-handle'
import { throttle } from '@kobato/inkling-internal/utils'

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

  const editorTkNodeMap = new Map<string, Map<string, { topLevelNodeKey: string }>>()

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
