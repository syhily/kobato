import { useEffect } from 'react'

import type { PublishState } from '@/ui/admin/editor-shell/editor-shell-types'

interface UseEditorKeyboardShortcutsArgs {
  mode: 'create' | 'edit'
  isEditing: boolean
  persistCreate: () => Promise<void>
  persistSave: () => void
  persistPublish: () => void
  publishState: PublishState
}

export function useEditorKeyboardShortcuts({
  mode,
  isEditing,
  persistCreate,
  persistSave,
  persistPublish,
  publishState,
}: UseEditorKeyboardShortcutsArgs): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.metaKey && !event.ctrlKey) {
        return
      }
      const key = event.key.toLowerCase()
      if (key === 's' && !event.shiftKey) {
        event.preventDefault()
        if (mode === 'create') {
          void persistCreate()
        } else {
          persistSave()
        }
        return
      }
      if (key === 'p' && event.shiftKey) {
        event.preventDefault()
        if (!isEditing) {
          return
        }
        if (publishState.kind !== 'published-current') {
          persistPublish()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, isEditing, persistCreate, persistSave, persistPublish, publishState])
}
