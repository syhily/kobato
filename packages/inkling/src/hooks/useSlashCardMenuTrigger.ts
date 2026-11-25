import type { CardMenuSession } from '@kobato/inkling-internal/hooks/useCardMenuSession'
import type { LexicalEditor } from 'lexical'

import { registerSlashCardMenuTrigger } from '@kobato/inkling-internal/plugins/behaviour/card-menu-trigger'
import { useEffect, useState } from 'react'
export interface SlashCardMenuTriggerState {
  query: string
  commandParams: string[]
}
export function useSlashCardMenuTrigger(
  editor: LexicalEditor,
  session: Pick<CardMenuSession, 'isOpen' | 'closeMenu' | 'saveCursor'>,
  enabled: boolean,
): SlashCardMenuTriggerState {
  const { isOpen, closeMenu, saveCursor } = session
  const [query, setQuery] = useState('')
  const [commandParams, setCommandParams] = useState<string[]>([])

  useEffect(() => {
    if (!enabled) {
      return
    }
    return registerSlashCardMenuTrigger(editor, {
      onVerdict: (verdict) => {
        if (verdict.type === 'close') {
          closeMenu()
          setQuery('')
          setCommandParams((current) => (current.length > 0 ? [] : current))
          return
        }
        saveCursor(verdict.cursorRange)
        setQuery(verdict.query)
        setCommandParams(verdict.commandParams)
      },
    })
  }, [editor, enabled, closeMenu, saveCursor])

  const [wasOpen, setWasOpen] = useState(isOpen)
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen)
    if (!isOpen) {
      setQuery('')
      setCommandParams((current) => (current.length > 0 ? [] : current))
    }
  }

  return { query, commandParams }
}
