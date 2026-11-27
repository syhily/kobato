import type { ExternalControlAPI } from '@kobato/inkling-internal/plugins/ExternalControlPlugin'
import type { LexicalEditor, SerializedEditorState } from 'lexical'

import { useEditorBodyReset } from '@kobato/inkling-internal/hooks/use-editor-body-reset'
import { useCallback, useState } from 'react'

export interface UseEditorSurfaceArgs<TBody extends SerializedEditorState> {
  initialBody: TBody
  bodyKey: string
  onBodyChange: (body: TBody) => void
  prepareSeed?: (body: TBody) => TBody
}

export interface EditorSurfaceHandle<TBody extends SerializedEditorState> {
  editorInstance: LexicalEditor | null
  registerAPI: (api: ExternalControlAPI | null) => void
  mountedInitialState: TBody
  handleChange: (state: SerializedEditorState) => void
}

export function useEditorSurface<TBody extends SerializedEditorState>({
  initialBody,
  bodyKey,
  onBodyChange,
  prepareSeed,
}: UseEditorSurfaceArgs<TBody>): EditorSurfaceHandle<TBody> {
  const [editorInstance, setEditorInstance] = useState<LexicalEditor | null>(null)
  const registerAPI = useCallback((api: ExternalControlAPI | null) => {
    setEditorInstance(api?.editorInstance ?? null)
  }, [])

  const { mountedInitialState, handleChange } = useEditorBodyReset(
    editorInstance,
    initialBody,
    bodyKey,
    onBodyChange,
    prepareSeed,
  )

  return { editorInstance, registerAPI, mountedInitialState, handleChange }
}
