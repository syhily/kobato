import { type EditorState, type LexicalEditor, type NodeKey } from 'lexical'
import React, { useState } from 'react'

import type { VideoNode } from '@/nodes/VideoNode'

import { CardActionToolbar } from '@/components/ui/CardActionToolbar'
import { VideoCard } from '@/components/ui/cards/VideoCard'
import { useCardIsEditing, useCardIsSelected } from '@/context/CardSelectionStoreContext'
import { useInklingHostEssentials } from '@/context/InklingHostIntegrationContext'
import { useCardChrome } from '@/hooks/useCardChrome'
import { useMediaCardUpload, useMediaUploader } from '@/hooks/useMediaCardUpload'
import { usePreviewLease } from '@/hooks/usePreviewLease'
import { $isVideoNode } from '@/nodes/base'
import { isCardWidth, normalizeCardWidth } from '@/nodes/base/utils/card-widths'
import { customThumbnailUploadIntent, videoFlowUploadIntent, type UploadFn } from '@/nodes/upload-intent'
import extractVideoMetadata, { type VideoMetadata } from '@/utils/extractVideoMetadata'

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
  initialFile: File | undefined
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
  const { editor, write, setField } = useCardChrome(nodeKey, $isVideoNode)
  const { fileUploader } = useInklingHostEssentials()
  const isSelected = useCardIsSelected(nodeKey)
  const isEditing = useCardIsEditing(nodeKey)
  const [previewThumbnail, setThumbnailPreview] = usePreviewLease()
  // the synthesized-thumbnail sub-flow's bare upload channel (no
  // input/drag/dialog wiring — the composition kicks it off itself)
  const thumbnailUploader = useMediaUploader('mediaThumbnail')
  const [metadataExtractionErrors, setMetadataExtractionErrors] = useState<VideoNodeMetadataError[]>([])

  const videoMimeTypes: string[] = fileUploader.fileTypes?.video?.mimeTypes || ['video/*']

  const handleVideoUpload = async (files: FileList | File[] | null, videoUpload: UploadFn) => {
    const file = files?.[0]
    if (!file) {
      return
    }

    let metadata: VideoMetadata
    try {
      metadata = await extractVideoMetadata(file)
    } catch (error) {
      setMetadataExtractionErrors([
        {
          name: file.name,
          message: `The file type you uploaded is not supported. Please use .${videoMimeTypes.join(', .').toUpperCase()}`,
        },
      ])
      return
    }

    if (metadata.thumbnailBlob) {
      setThumbnailPreview(metadata.thumbnailBlob)
    }

    // the main → thumbnail composition lives in upload-intent; the
    // component keeps the metadata catch and the preview lease
    await videoFlowUploadIntent({
      editor,
      nodeKey,
      videoUpload,
      thumbnailUpload: thumbnailUploader.upload,
      files: [file],
      meta: metadata,
      onEmptyPreview: () => setThumbnailPreview(null),
    })

    setThumbnailPreview(null)
  }

  const {
    uploader: videoUploader,
    fileInputRef: videoFileInputRef,
    dragHandler: videoDragHandler,
    onFileChange: onVideoFileChange,
  } = useMediaCardUpload({
    kind: 'video',
    nodeKey,
    guard: $isVideoNode,
    initialFile,
    isReady: (uploader) => !uploader.isLoading,
    triggerFileDialog,
    onFiles: (files, upload) => handleVideoUpload(files, upload),
  })

  const {
    uploader: customThumbnailUploader,
    dragHandler: thumbnailDragHandler,
    onFileChange: onCustomThumbnailChange,
  } = useMediaCardUpload({
    kind: 'image',
    nodeKey,
    guard: $isVideoNode,
    onFiles: (files, upload) => customThumbnailUploadIntent({ editor, nodeKey, upload, files }),
  })

  const onRemoveCustomThumbnail = () => {
    write((node) => {
      node.customThumbnailSrc = ''
      node.thumbnailHeight = node.height
      node.thumbnailWidth = node.width
    })
  }

  const onLoopChange = setField('loop')

  const onCardWidthChange = (width: unknown) => {
    if (!isCardWidth(width)) {
      return
    }

    write((node) => {
      node.cardWidth = width
    })
  }

  const isCardPopulated = customThumbnail || thumbnail

  return (
    <>
      <VideoCard
        captionEditor={captionEditor}
        captionEditorInitialState={captionEditorInitialState}
        cardWidth={cardWidth}
        customThumbnail={customThumbnail}
        customThumbnailUploader={customThumbnailUploader}
        fileInputRef={videoFileInputRef}
        isEditing={isEditing}
        isLoopChecked={isLoopChecked}
        isSelected={isSelected}
        thumbnail={previewThumbnail || thumbnail}
        thumbnailDragHandler={thumbnailDragHandler}
        thumbnailMimeTypes={fileUploader.fileTypes?.image?.mimeTypes ?? []}
        totalDuration={totalDuration}
        videoDragHandler={videoDragHandler}
        videoMimeTypes={videoMimeTypes}
        videoUploader={videoUploader}
        videoUploadErrors={[
          ...(thumbnailUploader.errors ?? []),
          ...metadataExtractionErrors,
          ...(videoUploader.errors ?? []),
        ]}
        onCardWidthChange={onCardWidthChange}
        onCustomThumbnailChange={onCustomThumbnailChange}
        onLoopChange={onLoopChange}
        onRemoveCustomThumbnail={onRemoveCustomThumbnail}
        onVideoFileChange={onVideoFileChange}
      />
      <CardActionToolbar editDataTestId="edit-video-card" nodeKey={nodeKey} visibleWhen={!!isCardPopulated} />
    </>
  )
}

/**
 * Video's decorate render — the React-bearing half of its decorate-target,
 * paired with the declaration by `@/nodes/cards/card-decorate`.
 */
export function renderVideoCard(node: VideoNode) {
  const cardWidth = normalizeCardWidth(node.cardWidth) ?? 'regular'

  return (
    <VideoNodeComponent
      captionEditor={node.__captionEditor}
      captionEditorInitialState={node.__captionEditorInitialState}
      cardWidth={cardWidth}
      customThumbnail={node.customThumbnailSrc}
      initialFile={node.__initialFile}
      isLoopChecked={node.loop}
      nodeKey={node.getKey()}
      thumbnail={node.thumbnailSrc}
      totalDuration={node.formattedDuration}
      triggerFileDialog={node.__triggerFileDialog}
    />
  )
}
