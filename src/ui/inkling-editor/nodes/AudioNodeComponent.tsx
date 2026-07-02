import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey, type NodeKey } from 'lexical'
import React from 'react'

import type { CardNode } from '@/ui/inkling-editor/types/lexical-internals'

import { ActionToolbar } from '@/ui/inkling-editor/components/ui/ActionToolbar'
import { AudioCard } from '@/ui/inkling-editor/components/ui/cards/AudioCard'
import { SnippetCreateToolbar } from '@/ui/inkling-editor/components/ui/SnippetCreateToolbar'
import { ToolbarMenu, ToolbarMenuItem, ToolbarMenuSeparator } from '@/ui/inkling-editor/components/ui/ToolbarMenu'
import CardContext from '@/ui/inkling-editor/context/CardContext'
import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import useFileDragAndDrop from '@/ui/inkling-editor/hooks/useFileDragAndDrop'
import { audioUploadHandler } from '@/ui/inkling-editor/utils/audioUploadHandler'
import { openFileSelection } from '@/ui/inkling-editor/utils/openFileSelection'
import { thumbnailUploadHandler } from '@/ui/inkling-editor/utils/thumbnailUploadHandler'

interface AudioNodeComponentProps {
  duration: number
  initialFile: File | undefined
  nodeKey: NodeKey
  src: string
  thumbnailSrc: string
  title: string
  triggerFileDialog: boolean
}

export function AudioNodeComponent({
  duration,
  initialFile,
  nodeKey,
  src,
  thumbnailSrc,
  title,
  triggerFileDialog,
}: AudioNodeComponentProps) {
  const [editor] = useLexicalComposerContext()
  const { fileUploader, cardConfig } = React.useContext(InklingComposerContext)
  const { isSelected, isEditing, setEditing } = React.useContext(CardContext)
  const audioFileInputRef = React.useRef<HTMLInputElement>(null)
  const thumbnailFileInputRef = React.useRef<HTMLInputElement>(null)
  const cardContext = React.useContext(CardContext)
  const [showSnippetToolbar, setShowSnippetToolbar] = React.useState(false)

  const audioUploader = fileUploader.useFileUpload('audio')
  const thumbnailUploader = fileUploader.useFileUpload('mediaThumbnail')
  const audioDragHandler = useFileDragAndDrop({ handleDrop: handleAudioDrop })
  const thumbnailDragHandler = useFileDragAndDrop({ handleDrop: handleThumbnailDrop, disabled: !isEditing })

  React.useEffect(() => {
    const uploadInitialFile = async (file: File) => {
      if (file && !src && !audioUploader.isLoading) {
        await audioUploadHandler([file], nodeKey, editor, audioUploader.upload)
      }
    }

    if (initialFile) {
      uploadInitialFile(initialFile)
    }

    // We only do this for init
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onAudioFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fls = e.target.files
    return await audioUploadHandler(fls, nodeKey, editor, audioUploader.upload)
  }

  const onThumbnailFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fls = e.target.files
    return await thumbnailUploadHandler(fls, nodeKey, editor, thumbnailUploader.upload)
  }

  const setTitle = (newTitle: string) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey) as CardNode | null
      if (node) {
        node.title = newTitle
      }
    })
  }

  const removeThumbnail = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey) as CardNode | null
      if (node) {
        node.thumbnailSrc = ''
      }
    })
  }

  async function handleAudioDrop(files: File[]) {
    await audioUploadHandler(files, nodeKey, editor, audioUploader.upload)
  }

  async function handleThumbnailDrop(files: File[]) {
    await thumbnailUploadHandler(files, nodeKey, editor, thumbnailUploader.upload)
  }

  const handleToolbarEdit = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setEditing(true)
  }

  // when card is inserted from the card menu or slash command we want to show the file picker immediately
  // uses a setTimeout to avoid issues with React rendering the component twice in dev mode 🙈
  React.useEffect(() => {
    if (!triggerFileDialog) {
      return
    }

    const renderTimeout = setTimeout(() => {
      // trigger dialog
      openFileSelection({ fileInputRef: audioFileInputRef })

      // clear the property on the node so we don't accidentally trigger anything with a re-render
      editor.update(() => {
        const node = $getNodeByKey(nodeKey) as CardNode | null
        if (node) {
          node.triggerFileDialog = false
        }
      })
    })

    return () => {
      clearTimeout(renderTimeout)
    }
  })

  return (
    <>
      <AudioCard
        audioDragHandler={audioDragHandler}
        audioFileInputRef={audioFileInputRef}
        audioMimeTypes={fileUploader.fileTypes?.audio?.mimeTypes}
        audioUploader={audioUploader}
        duration={duration}
        isEditing={cardContext.isEditing}
        removeThumbnail={removeThumbnail}
        src={src}
        thumbnailDragHandler={thumbnailDragHandler}
        thumbnailFileInputRef={thumbnailFileInputRef}
        thumbnailMimeTypes={fileUploader.fileTypes?.image?.mimeTypes}
        thumbnailSrc={thumbnailSrc}
        thumbnailUploader={thumbnailUploader}
        title={title}
        updateTitle={setTitle}
        onAudioFileChange={onAudioFileChange}
        onThumbnailFileChange={onThumbnailFileChange}
      />
      <ActionToolbar data-inkling-card-toolbar="audio" isVisible={showSnippetToolbar}>
        <SnippetCreateToolbar nodeKey={nodeKey} onClose={() => setShowSnippetToolbar(false)} />
      </ActionToolbar>

      <ActionToolbar
        data-inkling-card-toolbar="audio"
        isVisible={!!src && isSelected && !isEditing && !showSnippetToolbar}
      >
        <ToolbarMenu>
          <ToolbarMenuItem icon="edit" isActive={false} label="Edit" onClick={handleToolbarEdit} />
          <ToolbarMenuSeparator hide={!cardConfig.createSnippet} />
          <ToolbarMenuItem
            dataTestId="create-snippet"
            hide={!cardConfig.createSnippet}
            icon="snippet"
            isActive={false}
            label="Snippet"
            onClick={() => setShowSnippetToolbar(true)}
          />
        </ToolbarMenu>
      </ActionToolbar>
    </>
  )
}
