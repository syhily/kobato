import type { AudioNode } from '@kobato/inkling-internal/nodes/AudioNode'

import { CardActionToolbar } from '@kobato/inkling-internal/components/ui/CardActionToolbar'
import { AudioCard } from '@kobato/inkling-internal/components/ui/cards/AudioCard'
import { useCardIsEditing } from '@kobato/inkling-internal/context/CardSelectionStoreContext'
import { useInklingHostEssentials } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import { useCardChrome } from '@kobato/inkling-internal/hooks/useCardChrome'
import { useMediaCardUpload } from '@kobato/inkling-internal/hooks/useMediaCardUpload'
import { $isAudioNode } from '@kobato/inkling-internal/nodes/base'
import { audioThumbnailUploadIntent, audioUploadIntent } from '@kobato/inkling-internal/nodes/upload-intent'
import { type NodeKey } from 'lexical'

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
  const { editor, write, setField } = useCardChrome(nodeKey, $isAudioNode)
  const { fileUploader } = useInklingHostEssentials()
  const isEditing = useCardIsEditing(nodeKey)

  const {
    uploader: audioUploader,
    fileInputRef: audioFileInputRef,
    dragHandler: audioDragHandler,
    onFileChange: onAudioFileChange,
  } = useMediaCardUpload({
    kind: 'audio',
    nodeKey,
    guard: $isAudioNode,
    initialFile,
    isReady: (uploader) => !src && !uploader.isLoading,
    triggerFileDialog,
    onFiles: (files, upload) => audioUploadIntent({ editor, nodeKey, upload, files }),
  })

  const {
    uploader: thumbnailUploader,
    fileInputRef: thumbnailFileInputRef,
    dragHandler: thumbnailDragHandler,
    onFileChange: onThumbnailFileChange,
  } = useMediaCardUpload({
    kind: 'mediaThumbnail',
    nodeKey,
    guard: $isAudioNode,
    dragDisabled: !isEditing,
    onFiles: (files, upload) => audioThumbnailUploadIntent({ editor, nodeKey, upload, files }),
  })

  const setTitle = setField('title')

  const removeThumbnail = () => {
    write((node) => {
      node.thumbnailSrc = ''
    })
  }

  return (
    <>
      <AudioCard
        audioDragHandler={audioDragHandler}
        audioFileInputRef={audioFileInputRef}
        audioMimeTypes={fileUploader.fileTypes?.audio?.mimeTypes}
        audioUploader={audioUploader}
        duration={duration}
        isEditing={isEditing}
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
      <CardActionToolbar nodeKey={nodeKey} visibleWhen={!!src} />
    </>
  )
}

export function renderAudioCard(node: AudioNode) {
  return (
    <AudioNodeComponent
      duration={node.duration}
      initialFile={node.__initialFile}
      nodeKey={node.getKey()}
      src={node.src}
      thumbnailSrc={node.thumbnailSrc}
      title={node.title}
      triggerFileDialog={node.__triggerFileDialog}
    />
  )
}
