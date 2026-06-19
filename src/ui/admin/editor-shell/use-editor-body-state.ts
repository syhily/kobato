import { useMemo, useState } from 'react'

import type { EditorBody, EditorShellArgs, EntityLike } from '@/ui/admin/editor-shell/editor-shell-types'

import { EMPTY_INKLING_DOCUMENT } from '@/shared/inkling/empty'

export interface EditorBodyState {
  body: EditorBody
  setBody: React.Dispatch<React.SetStateAction<EditorBody>>
  bodyKey: string
  initialBody: EditorBody
  lastSavedBody: EditorBody
  replaceBody: (body: EditorBody, key: string) => void
  markBodySaved: (savedBody: EditorBody) => void
}

export function useEditorBodyState<TEntity extends EntityLike>(args: EditorShellArgs<TEntity>): EditorBodyState {
  const initialBody = useMemo<EditorBody>(() => {
    if (!args.isEditing) {
      return EMPTY_INKLING_DOCUMENT
    }
    return (args.detail.latestRevision ?? args.detail.publishedRevision)?.body ?? EMPTY_INKLING_DOCUMENT
  }, [args])

  const [body, setBody] = useState<EditorBody>(initialBody)

  const initialBodyKey = useMemo(() => {
    if (!args.isEditing) {
      return 'create:initial'
    }
    const rev = args.detail.latestRevision ?? args.detail.publishedRevision
    return rev !== null ? `${args.detail.entity.id}:${rev.clientRevisionToken}` : `${args.detail.entity.id}:empty`
  }, [args])

  const [bodyKey, setBodyKey] = useState(initialBodyKey)
  const [lastSavedBody, setLastSavedBody] = useState<EditorBody>(initialBody)

  const replaceBody = (newBody: EditorBody, key: string) => {
    setBody(newBody)
    setBodyKey(key)
  }

  const markBodySaved = (savedBody: EditorBody) => {
    setLastSavedBody(savedBody)
  }

  return { body, setBody, bodyKey, initialBody, lastSavedBody, replaceBody, markBodySaved }
}
