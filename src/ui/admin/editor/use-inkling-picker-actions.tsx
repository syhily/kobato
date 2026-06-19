import type { LexicalEditor } from 'lexical'
import type { RefObject } from 'react'

import { $getSelection, $isNodeSelection } from 'lexical'
import { useState } from 'react'

import type { AdminImageDto } from '@/shared/types/images'
import type { AdminMusicDto } from '@/shared/types/music'
import type { InklingArticleEditorActions } from '@/ui/inkling/editor/article/article-editor-context'

import { ImageLibraryPicker } from '@/ui/admin/editor/pickers/ImageLibraryPicker'
import { MusicPickerDialog } from '@/ui/admin/editor/pickers/MusicPickerDialog'
import { ImageCardNode, MusicCardNode } from '@/ui/inkling/editor/cards/simple-card-nodes'

function findSelectedCardNode<T>(editor: LexicalEditor | null, guard: (node: unknown) => node is T): T | null {
  if (editor === null) {
    return null
  }
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isNodeSelection(selection)) {
      return null
    }
    const nodes = selection.getNodes()
    const node = nodes[0]
    if (node !== undefined && guard(node)) {
      return node
    }
    return null
  })
}

export function useEditorPickerActions(editorRef: RefObject<LexicalEditor | null>) {
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

  const handleImagePick = (image: AdminImageDto) => {
    const node = findSelectedCardNode(editorRef.current, (n): n is ImageCardNode => n instanceof ImageCardNode)
    if (node === null) {
      return
    }
    editorRef.current?.update(() => {
      node.setSrc(image.publicUrl)
      node.setAlt(image.note ?? '')
      node.setWidth(image.width)
      node.setHeight(image.height)
      node.setStoragePath(image.storagePath)
      node.setImageId(image.id)
      node.setThumbhash(image.thumbhash ?? undefined)
    })
  }

  const handleMusicPick = (music: AdminMusicDto) => {
    const node = findSelectedCardNode(editorRef.current, (n): n is MusicCardNode => n instanceof MusicCardNode)
    if (node === null) {
      return
    }
    editorRef.current?.update(() => {
      node.setPlayerId(music.playerId)
    })
  }

  const renderPickers = () => (
    <>
      <ImageLibraryPicker open={imageOpen} onOpenChange={setImageOpen} onPick={handleImagePick} />
      <MusicPickerDialog open={musicOpen} onOpenChange={setMusicOpen} onPick={handleMusicPick} />
    </>
  )

  return { actions, renderPickers }
}
