import { useMemo, useRef, useState } from 'react'

import type { PortableTextBody } from '@/shared/pt/schema'
import type { EditorShellArgs, EntityLike } from '@/ui/admin/editor-shell/editor-shell-types'

export interface EditorBodyState {
  body: PortableTextBody
  setBody: React.Dispatch<React.SetStateAction<PortableTextBody>>
  bodyKey: string
  initialBody: PortableTextBody
  lastSavedBodyRef: React.RefObject<PortableTextBody>
  replaceBody: (body: PortableTextBody, key: string) => void
  markBodySaved: (savedBody: PortableTextBody) => void
}

export function useEditorBodyState<TEntity extends EntityLike>(args: EditorShellArgs<TEntity>): EditorBodyState {
  const initialBody = useMemo<PortableTextBody>(() => {
    if (!args.isEditing) {
      return []
    }
    return (args.detail.latestRevision ?? args.detail.publishedRevision)?.body ?? []
  }, [args])

  const [body, setBody] = useState<PortableTextBody>(initialBody)

  const initialBodyKey = useMemo(() => {
    if (!args.isEditing) {
      return 'create:initial'
    }
    const rev = args.detail.latestRevision ?? args.detail.publishedRevision
    return rev !== null ? `${args.detail.entity.id}:${rev.clientRevisionToken}` : `${args.detail.entity.id}:empty`
  }, [args])

  const [bodyKey, setBodyKey] = useState(initialBodyKey)
  const lastSavedBodyRef = useRef<PortableTextBody>(initialBody)

  const replaceBody = (newBody: PortableTextBody, key: string) => {
    setBody(newBody)
    setBodyKey(key)
  }

  const markBodySaved = (savedBody: PortableTextBody) => {
    lastSavedBodyRef.current = savedBody
  }

  return { body, setBody, bodyKey, initialBody, lastSavedBodyRef, replaceBody, markBodySaved }
}
