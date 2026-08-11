import { useEffect } from 'react'

import type { PublishState } from '@/ui/admin/editor-shell/editor-shell-types'

interface UseEditorKeyboardShortcutsArgs {
  mode: 'create' | 'edit'
  isEditing: boolean
  /** Mirrors the toolbar's disabled state — a second Cmd+S mid-flight would
   *  resend the same expected token and surface a spurious revision conflict. */
  isPending: boolean
  persistCreate: () => Promise<void>
  persistSave: () => void
  persistPublish: () => void
  publishState: PublishState
}

export function useEditorKeyboardShortcuts({
  mode,
  isEditing,
  isPending,
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
        if (isPending) {
          return
        }
        if (mode === 'create') {
          void persistCreate()
        } else {
          persistSave()
        }
        return
      }
      if (key === 'p' && event.shiftKey) {
        event.preventDefault()
        if (!isEditing || isPending) {
          return
        }
        if (publishState.kind !== 'published-current') {
          persistPublish()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, isEditing, isPending, persistCreate, persistSave, persistPublish, publishState])
}
