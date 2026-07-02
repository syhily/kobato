import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey, type EditorState, type LexicalEditor, type NodeKey } from 'lexical'
import React, { useState } from 'react'

import { ActionToolbar } from '@/ui/inkling-editor/components/ui/ActionToolbar'
import { VideoCard } from '@/ui/inkling-editor/components/ui/cards/VideoCard'
import { SnippetCreateToolbar } from '@/ui/inkling-editor/components/ui/SnippetCreateToolbar'
import { ToolbarMenu, ToolbarMenuItem, ToolbarMenuSeparator } from '@/ui/inkling-editor/components/ui/ToolbarMenu'
import CardContext from '@/ui/inkling-editor/context/CardContext'
import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import useFileDragAndDrop from '@/ui/inkling-editor/hooks/useFileDragAndDrop'
import { GeneratedDecoratorNodeBase } from '@/ui/inkling-editor/nodes/base'
import extractVideoMetadata from '@/ui/inkling-editor/utils/extractVideoMetadata'
import { getImageDimensions } from '@/ui/inkling-editor/utils/getImageDimensions'
import { openFileSelection } from '@/ui/inkling-editor/utils/openFileSelection'

interface VideoNodeComponentProps {
  nodeKey: NodeKey
  thumbnail: string
  customThumbnail: string
  captionEditor: LexicalEditor | null
  captionEditorInitialState: EditorState | undefined
  totalDuration: string
  cardWidth: string
  triggerFileDialog: boolean
  isLoopChecked: boolean
  initialFile: File | null
}

interface VideoNodeMetadataError {
  name: string
  message: string
}

export function VideoNodeComponent({
  nodeKey,
  thumbnail,
  customThumbnail,
  captionEditor,
  captionEditorInitialState,
  totalDuration,
  cardWidth,
  triggerFileDialog,
  isLoopChecked,
  initialFile,
}: VideoNodeComponentProps) {
  const [editor] = useLexicalComposerContext()
  const { fileUploader, cardConfig } = React.useContext(InklingComposerContext)
  const cardContext = React.useContext(CardContext)
  const videoFileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [previewThumbnail, setPreviewThumbnail] = useState<string>('')
  const videoUploader = fileUploader.useFileUpload('video')
  const thumbnailUploader = fileUploader.useFileUpload('mediaThumbnail')
  const customThumbnailUploader = fileUploader.useFileUpload('image')

  const videoDragHandler = useFileDragAndDrop({ handleDrop: handleVideoDrop })
  const thumbnailDragHandler = useFileDragAndDrop({ handleDrop: handleThumbnailDrop })
  const [metadataExtractionErrors, setMetadataExtractionErrors] = useState<VideoNodeMetadataError[]>([])
  const [showSnippetToolbar, setShowSnippetToolbar] = useState<boolean>(false)

  const videoMimeTypes: string[] = fileUploader.fileTypes?.video?.mimeTypes || ['video/*']

  React.useEffect(() => {
    const uploadInitialFiles = async (file: File | null) => {
      if (file && !videoUploader.isLoading) {
        await handleVideoUpload([file])
      }
    }
    uploadInitialFiles(initialFile)

    // We only do this for init
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleVideoUpload = async (files: FileList | File[]) => {
    const file = files[0]
    if (!file) {
      return
    }
    let thumbnailBlob: Blob | undefined
    let duration = 0
    let width = 0
    let height = 0
    let mimeType = ''
    try {
      ;({ thumbnailBlob, duration, width, height, mimeType } = await extractVideoMetadata(file))
    } catch (error) {
      setMetadataExtractionErrors([
        {
          name: file.name,
          message: `The file type you uploaded is not supported. Please use .${videoMimeTypes.join(', .').toUpperCase()}`,
        },
      ])
      return
    }

    if (thumbnailBlob) {
      setPreviewThumbnail(URL.createObjectURL(thumbnailBlob))
    }

    const videoUploadResult = await videoUploader.upload([file])
    const videoUrl = videoUploadResult?.[0]?.url

    if (!videoUrl) {
      setPreviewThumbnail('')
      return
    }

    if (videoUrl) {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node) {
          ;(node as GeneratedDecoratorNodeBase).src = videoUrl
          ;(node as GeneratedDecoratorNodeBase).duration = duration
          ;(node as GeneratedDecoratorNodeBase).fileName = file.name
          ;(node as GeneratedDecoratorNodeBase).width = width
          ;(node as GeneratedDecoratorNodeBase).height = height
          ;(node as GeneratedDecoratorNodeBase).mimeType = mimeType
          if (!(node as GeneratedDecoratorNodeBase).customThumbnailSrc) {
            ;(node as GeneratedDecoratorNodeBase).thumbnailWidth = width
            ;(node as GeneratedDecoratorNodeBase).thumbnailHeight = height
          }
        }
      })
    }

    if (!thumbnailBlob) {
      return
    }

    const thumbnailFile = new File([thumbnailBlob], `${file.name}.jpg`, { type: 'image/jpeg' })
    const imageUploadResult = await thumbnailUploader.upload([thumbnailFile], { formData: { url: videoUrl } })
    const imageUrl = imageUploadResult?.[0]?.url

    if (imageUrl) {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node) {
          ;(node as GeneratedDecoratorNodeBase).thumbnailSrc = imageUrl
        }
      })
    }

    setPreviewThumbnail('')
  }

  const onVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      return
    }
    await handleVideoUpload(e.target.files ? Array.from(e.target.files) : [])
  }

  const handleCustomThumbnailChange = async (files: FileList | File[]) => {
    const customThumbnailUploadResult = await customThumbnailUploader.upload(files)
    const imageUrl = customThumbnailUploadResult?.[0]?.url
    if (!imageUrl) {
      return
    }
    const { width, height } = await getImageDimensions(imageUrl)

    if (imageUrl) {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node) {
          ;(node as GeneratedDecoratorNodeBase).customThumbnailSrc = imageUrl
          ;(node as GeneratedDecoratorNodeBase).thumbnailWidth = width
          ;(node as GeneratedDecoratorNodeBase).thumbnailHeight = height
        }
      })
    }
  }

  const onCustomThumbnailChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await handleCustomThumbnailChange(e.target.files ? Array.from(e.target.files) : [])
  }

  async function handleVideoDrop(files: File[]) {
    await handleVideoUpload(files)
  }

  async function handleThumbnailDrop(files: File[]) {
    await handleCustomThumbnailChange(files)
  }

  const onRemoveCustomThumbnail = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) {
        const n = node as GeneratedDecoratorNodeBase
        n.customThumbnailSrc = ''
        n.thumbnailHeight = n.height
        n.thumbnailWidth = n.width
      }
    })
  }

  const onLoopChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) {
        ;(node as GeneratedDecoratorNodeBase).loop = true
      }
    })
  }

  const onCardWidthChange = (width: string) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) {
        ;(node as GeneratedDecoratorNodeBase).cardWidth = width
      }
      cardContext.setCardWidth(width)
    })
  }

  const handleToolbarEdit = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    cardContext.setEditing(true)
  }

  // when card is inserted from the card menu or slash command we want to show the file picker immediately
  // uses a setTimeout to avoid issues with React rendering the component twice in dev mode 🙈
  React.useEffect(() => {
    if (!triggerFileDialog) {
      return
    }

    const renderTimeout = setTimeout(() => {
      // trigger dialog
      openFileSelection({ fileInputRef: videoFileInputRef })

      // clear the property on the node so we don't accidentally trigger anything with a re-render
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node) {
          ;(node as GeneratedDecoratorNodeBase).triggerFileDialog = false
        }
      })
    })

    return () => {
      clearTimeout(renderTimeout)
    }
  })

  const isCardPopulated = customThumbnail || thumbnail

  return (
    <>
      {/* oxlint-disable-next-line typescript/no-explicit-any */}
      <VideoCard
        {...({
          captionEditor,
          captionEditorInitialState,
          cardWidth,
          customThumbnail,
          customThumbnailUploader,
          fileInputRef: videoFileInputRef,
          isEditing: cardContext.isEditing,
          isLoopChecked,
          isSelected: cardContext.isSelected,
          thumbnail: previewThumbnail || thumbnail,
          thumbnailDragHandler,
          thumbnailMimeTypes: fileUploader.fileTypes?.image?.mimeTypes ?? [],
          totalDuration,
          videoDragHandler,
          videoMimeTypes,
          videoUploader,
          videoUploadErrors: [
            ...(thumbnailUploader.errors ?? []),
            ...metadataExtractionErrors,
            ...(videoUploader.errors ?? []),
          ],
          onCardWidthChange,
          onCustomThumbnailChange,
          onLoopChange,
          onRemoveCustomThumbnail,
          onVideoFileChange,
          // oxlint-disable-next-line typescript/no-explicit-any
        } as any)}
      />
      <ActionToolbar data-inkling-card-toolbar="video" isVisible={showSnippetToolbar}>
        <SnippetCreateToolbar nodeKey={nodeKey} onClose={() => setShowSnippetToolbar(false)} />
      </ActionToolbar>

      <ActionToolbar
        data-inkling-card-toolbar="video"
        isVisible={!!isCardPopulated && cardContext.isSelected && !cardContext.isEditing && !showSnippetToolbar}
      >
        <ToolbarMenu>
          <ToolbarMenuItem
            dataTestId="edit-video-card"
            icon="edit"
            isActive={false}
            label="Edit"
            onClick={handleToolbarEdit}
          />
          <ToolbarMenuSeparator hide={!cardConfig.createSnippet} />
          <ToolbarMenuItem
            dataTestId="create-snippet"
            hide={!cardConfig.createSnippet}
            icon="snippet"
            isActive={false}
            label="Save as snippet"
            onClick={() => setShowSnippetToolbar(true)}
          />
        </ToolbarMenu>
      </ActionToolbar>
    </>
  )
}
