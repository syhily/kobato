import { useMemo, useState } from 'react'

import type { PortableTextBody } from '@/shared/pt/schema'
import type { EditorShellArgs, EntityLike } from '@/ui/admin/editor-shell/editor-shell-types'

export interface EditorBodyState {
  body: PortableTextBody
  setBody: React.Dispatch<React.SetStateAction<PortableTextBody>>
  bodyKey: string
  initialBody: PortableTextBody
  lastSavedBody: PortableTextBody
  replaceBody: (body: PortableTextBody, key: string) => void
  markBodySaved: (savedBody: PortableTextBody) => void
}

export function useEditorBodyState<TEntity extends EntityLike>(args: EditorShellArgs<TEntity>): EditorBodyState {
  // Deps are the primitive/loader references, NOT `args` itself — the shell
  // rebuilds the args object every render, so `[args]` would recompute every
  // render and hand out a fresh `[]` in create mode. That unstable
  // `initialBody` fed the conflict check in use-editor-shell-state into an
  // infinite setState-during-render loop on /editor/*/new.
  const initialBody = useMemo<PortableTextBody>(() => {
    if (!args.isEditing) {
      return []
    }
    return (args.detail.latestRevision ?? args.detail.publishedRevision)?.body ?? []
  }, [args.isEditing, args.detail])

  const [body, setBody] = useState<PortableTextBody>(initialBody)

  const initialBodyKey = useMemo(() => {
    if (!args.isEditing) {
      return 'create:initial'
    }
    const rev = args.detail.latestRevision ?? args.detail.publishedRevision
    return rev !== null ? `${args.detail.entity.id}:${rev.clientRevisionToken}` : `${args.detail.entity.id}:empty`
  }, [args.isEditing, args.detail])

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
