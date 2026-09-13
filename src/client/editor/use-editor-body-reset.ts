// The body-lifecycle glue both inkling surfaces (page + comment) share:
//
// - Mount snapshot: Lexical consumes the initial state only at editor
//   creation, so the lazy state pins the mount-time seed — later
//   `initialBody` prop changes must NOT recreate the composer.
// - Imperative reseed: a `bodyKey` change (draft adopt, conflict resolution,
//   reply-form reset, switching the edited comment) re-parses the seed into
//   the live editor. `initialBody` identity changes alone re-run the effect
//   but early-out on the key check.
// - Stable change emitter: `onBodyChange` rides a ref so the per-keystroke
//   `handleChange` never changes identity. The emitter is the one narrowing
//   boundary: inkling hands the stock SerializedEditorState; each surface's
//   body type is the same JSON (restricted to its whitelist — schema.ts's
//   WireCheck pins the extension) and the server re-validates on save, so
//   the per-keystroke path casts instead of zod-parsing.
//
// `prepareSeed` shapes the seed before the composer parses it (the comment
// surface's legacy-PT fallback + math-fence downgrade); the page surface
// seeds the validated state as-is.

import { useCallback, useEffect, useRef, useState } from 'react'

import type { LexicalEditor, SerializedEditorState } from '@/inkling'

import { unsafeCast } from '@/shared/utils/unsafe-cast'

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
