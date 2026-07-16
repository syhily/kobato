import { useMemo, useState } from 'react'

import type { PortableTextBody } from '@/shared/pt/schema'
import type { EditorShellDetail, EntityLike } from '@/ui/admin/editor-shell/editor-shell-types'

import { deriveBaselineRevision } from '@/ui/admin/editor-shell/editor-shell-derived'

export interface EditorBodyState {
  body: PortableTextBody
  setBody: React.Dispatch<React.SetStateAction<PortableTextBody>>
  bodyKey: string
  initialBody: PortableTextBody
  lastSavedBody: PortableTextBody
  replaceBody: (body: PortableTextBody, key: string) => void
  markBodySaved: (savedBody: PortableTextBody) => void
}

// The module owns the empty-body identity: both "no body yet" paths must
// hand out this single reference, never a fresh `[]`. A fresh array per
// recompute fed the conflict check in use-editor-shell-state into an
// infinite setState-during-render loop ("Too many re-renders") — live in
// edit mode when an entity has zero revisions.
const EMPTY_BODY: PortableTextBody = []

export function useEditorBodyState<TEntity extends EntityLike>(
  detail: EditorShellDetail<TEntity> | undefined,
): EditorBodyState {
  // `detail` is the loader-stable reference the shell TSX memoizes, so the
  // memos below recompute only when the loaded entity actually changes.
  const initialBody = useMemo<PortableTextBody>(() => {
    return deriveBaselineRevision(detail)?.body ?? EMPTY_BODY
  }, [detail])

  const [body, setBody] = useState<PortableTextBody>(initialBody)

  const initialBodyKey = useMemo(() => {
    if (detail === undefined) {
      return 'create:initial'
    }
    const rev = deriveBaselineRevision(detail)
    return rev !== null ? `${detail.entity.id}:${rev.clientRevisionToken}` : `${detail.entity.id}:empty`
  }, [detail])

  const [bodyKey, setBodyKey] = useState(initialBodyKey)
  const [lastSavedBody, setLastSavedBody] = useState<PortableTextBody>(initialBody)

  const replaceBody = (newBody: PortableTextBody, key: string) => {
    setBody(newBody)
    setBodyKey(key)
  }

  const markBodySaved = (savedBody: PortableTextBody) => {
    setLastSavedBody(savedBody)
  }

  return { body, setBody, bodyKey, initialBody, lastSavedBody, replaceBody, markBodySaved }
}
