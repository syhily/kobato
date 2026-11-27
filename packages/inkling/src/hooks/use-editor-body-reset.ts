import type { LexicalEditor, SerializedEditorState } from 'lexical'

import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { useCallback, useEffect, useRef, useState } from 'react'

function identitySeed<TBody>(body: TBody): TBody {
  return body
}

export function useEditorBodyReset<TBody extends SerializedEditorState>(
  editor: LexicalEditor | null,
  initialBody: TBody,
  bodyKey: string,
  onBodyChange: (body: TBody) => void,
  prepareSeed?: (body: TBody) => TBody,
): { mountedInitialState: TBody; handleChange: (state: SerializedEditorState) => void } {
  const seed = prepareSeed ?? identitySeed

  const onBodyChangeRef = useRef(onBodyChange)
  useEffect(() => {
    onBodyChangeRef.current = onBodyChange
  })

  const [mountedInitialState] = useState(() => seed(initialBody))
  const lastResetKeyRef = useRef(bodyKey)
  useEffect(() => {
    if (editor === null || lastResetKeyRef.current === bodyKey) {
      return
    }
    lastResetKeyRef.current = bodyKey
    editor.setEditorState(editor.parseEditorState(seed(initialBody)))
  }, [editor, initialBody, bodyKey, seed])

  const handleChange = useCallback((state: SerializedEditorState) => {
    onBodyChangeRef.current(unsafeCast<TBody>(state))
  }, [])

  return { mountedInitialState, handleChange }
}
