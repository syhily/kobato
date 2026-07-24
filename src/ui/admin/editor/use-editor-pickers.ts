import type { Editor } from '@tiptap/react'

import { useCallback, useState } from 'react'

import type { AdminImageDto } from '@/shared/contracts/images'
import type { AdminMusicDto } from '@/shared/contracts/music'

import { generateBlockKey } from '@/shared/pt/utils'

export interface EditorPickers {
  imagePickerOpen: boolean
  setImagePickerOpen: (open: boolean) => void
  musicPickerOpen: boolean
  setMusicPickerOpen: (open: boolean) => void
  insertImage: (image: AdminImageDto) => void
  insertMusic: (music: AdminMusicDto) => void
}

export function useEditorPickers(editor: Editor | null): EditorPickers {
  const [imagePickerOpen, setImagePickerOpen] = useState(false)
  const [musicPickerOpen, setMusicPickerOpen] = useState(false)

  const insertImage = useCallback(
    (image: AdminImageDto) => {
      if (editor === null) {
        return
      }
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'image',
          attrs: {
            _key: generateBlockKey(),
            src: image.publicUrl,
            alt: image.note ?? '',
            width: image.width,
            height: image.height,
            thumbhash: image.thumbhash ?? undefined,
            storagePath: image.storagePath,
            imageId: image.id,
          },
        })
        .run()
    },
    [editor],
  )

  const insertMusic = useCallback(
    (music: AdminMusicDto) => {
      if (editor === null) {
        return
      }
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'blockCard',
          attrs: {
            _key: generateBlockKey(),
            _ptType: 'musicPlayer',
            payload: { _type: 'musicPlayer', _key: generateBlockKey(), playerId: music.playerId },
          },
        })
        .run()
    },
    [editor],
  )

  return {
    imagePickerOpen,
    setImagePickerOpen,
    musicPickerOpen,
    setMusicPickerOpen,
    insertImage,
    insertMusic,
  }
}
