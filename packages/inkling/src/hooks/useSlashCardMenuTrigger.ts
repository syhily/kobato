import type { CardMenuSession } from '@kobato/inkling-internal/hooks/useCardMenuSession'
import type { LexicalEditor } from 'lexical'

import { registerSlashCardMenuTrigger } from '@kobato/inkling-internal/plugins/behaviour/card-menu-trigger'
import React from 'react'

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
  const [query, setQuery] = React.useState('')
  const [commandParams, setCommandParams] = React.useState<string[]>([])

  React.useEffect(() => {
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

  const [wasOpen, setWasOpen] = React.useState(isOpen)
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen)
    if (!isOpen) {
      setQuery('')
      setCommandParams((current) => (current.length > 0 ? [] : current))
    }
  }

  return { query, commandParams }
}
