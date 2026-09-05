import type { LexicalEditor } from 'lexical'

import React from 'react'

import type { CardMenuSession } from '@/hooks/useCardMenuSession'

import { registerSlashCardMenuTrigger } from '@/plugins/behaviour/card-menu-trigger'

// Slash trigger binding — the React adapter between the slash card-menu
// trigger (@/plugins/behaviour/card-menu-trigger) and the card-menu session.
// It owns the slash trigger state (the typed query and its command params)
// and translates verdicts into session calls: a query verdict leases the
// cursor range into the session (so Escape can restore it) and tracks the
// query; a close verdict runs the close policy. Every close path the session
// owns (Escape, outside mousedown, insert-and-close) resets the state here in
// one place, so the session itself stays trigger-agnostic. CardMenuPopup is
// the sole consumer, enabling the binding only for its 'slash' trigger
// syntax.

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

  // a close the session initiated itself (Escape, outside mousedown, insert)
  // carries no verdict — the trigger state resets on the close signal instead
  // (adjust-state-on-render, not an effect: no cascading render)
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
