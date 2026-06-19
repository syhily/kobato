import { useState } from 'react'

import type { InklingArticleEditorActions } from '@/ui/inkling/editor/article/article-editor-context'

import { ImageLibraryPicker } from '@/ui/admin/editor/pickers/ImageLibraryPicker'
import { MusicPickerDialog } from '@/ui/admin/editor/pickers/MusicPickerDialog'

export function useEditorPickerActions() {
  const [imageOpen, setImageOpen] = useState(false)
  const [musicOpen, setMusicOpen] = useState(false)

  const actions: InklingArticleEditorActions = {
    openImagePicker: () => {
      setImageOpen(true)
    },
    openMusicPicker: () => {
      setMusicOpen(true)
    },
  }

  const renderPickers = () => (
    <>
      <ImageLibraryPicker open={imageOpen} onOpenChange={setImageOpen} onPick={() => {}} />
      <MusicPickerDialog open={musicOpen} onOpenChange={setMusicOpen} onPick={() => {}} />
    </>
  )

  return { actions, renderPickers }
}
