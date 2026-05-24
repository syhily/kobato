import { useMemo, useRef, useState } from 'react'

import type { PortableTextBody } from '@/shared/pt/schema'
import type { EntityLike, RevisionLike } from '@/ui/admin/editor-shell/editor-shell-types'

export interface EditorBodyState {
  body: PortableTextBody
  setBody: React.Dispatch<React.SetStateAction<PortableTextBody>>
  bodyKey: string
  initialBody: PortableTextBody
  lastSavedBodyRef: React.RefObject<PortableTextBody>
  replaceBody: (body: PortableTextBody, key: string) => void
  markBodySaved: (savedBody: PortableTextBody) => void
}

export function useEditorBodyState<TEntity extends EntityLike>(
  isEditing: boolean,
  detail: { entity: TEntity; latestRevision: RevisionLike | null; publishedRevision: RevisionLike | null } | undefined,
): EditorBodyState {
  const initialBody = useMemo<PortableTextBody>(() => {
    if (!isEditing) {
      return []
    }
    return (detail!.latestRevision ?? detail!.publishedRevision)?.body ?? []
  }, [isEditing, detail])

  const [body, setBody] = useState<PortableTextBody>(initialBody)

  const initialBodyKey = useMemo(() => {
    if (!isEditing) {
      return 'create:initial'
    }
    const rev = detail!.latestRevision ?? detail!.publishedRevision
    return rev !== null ? `${detail!.entity.id}:${rev.clientRevisionToken}` : `${detail!.entity.id}:empty`
  }, [isEditing, detail])

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
