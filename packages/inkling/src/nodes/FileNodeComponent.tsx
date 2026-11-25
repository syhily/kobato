import type { FileNode } from '@kobato/inkling-internal/nodes/FileNode'

import { CardActionToolbar } from '@kobato/inkling-internal/components/ui/CardActionToolbar'
import { FileCard } from '@kobato/inkling-internal/components/ui/cards/FileCard'
import { useCardIsEditing } from '@kobato/inkling-internal/context/CardSelectionStoreContext'
import { useCardChrome } from '@kobato/inkling-internal/hooks/useCardChrome'
import { useInklingLabels } from '@kobato/inkling-internal/hooks/useInklingLabels'
import { useMediaCardUpload } from '@kobato/inkling-internal/hooks/useMediaCardUpload'
import { $isFileNode } from '@kobato/inkling-internal/nodes/base'
import { fileUploadIntent } from '@kobato/inkling-internal/nodes/upload-intent'
import { type NodeKey } from 'lexical'
import { type ChangeEvent, useState } from 'react'
export interface FileNodeComponentProps {
  fileDesc: string
  fileDescPlaceholder?: string
  fileName: string
  fileSize: string
  fileTitle: string
  fileTitlePlaceholder?: string
  fileSrc: string
  nodeKey: NodeKey
  triggerFileDialog: boolean
  initialFile?: File
}

function FileNodeComponent({
  fileDesc,
  fileDescPlaceholder,
  fileName,
  fileSize,
  fileTitle,
  fileTitlePlaceholder,
  fileSrc,
  nodeKey,
  triggerFileDialog,
  initialFile,
}: FileNodeComponentProps) {
  const { editor, write } = useCardChrome(nodeKey, $isFileNode)
  const labels = useInklingLabels()
  const [isPopulated, setIsPopulated] = useState<boolean>(() => !!(fileSrc && fileSize && fileName))
  const isEditing = useCardIsEditing(nodeKey)

  const {
    uploader,
    fileInputRef,
    dragHandler: fileDragHandler,
    onFileChange,
  } = useMediaCardUpload({
    kind: 'file',
    nodeKey,
    guard: $isFileNode,
    initialFile,
    isReady: () => !fileSrc,
    triggerFileDialog,
    onFiles: (files, upload, source) =>
      fileUploadIntent({
        editor,
        nodeKey,
        upload,
        files,
        prePatch:
          source === 'input'
            ? (node) => {
                node.src = ''
              }
            : undefined,
      }),
  })

  const isComplete = !!(fileSrc && fileSize && fileName)
  const [prevComplete, setPrevComplete] = useState(isComplete)
  if (prevComplete !== isComplete) {
    setPrevComplete(isComplete)
    if (isComplete) {
      setIsPopulated(true)
    }
  }

  const handleFileTitle = (e: ChangeEvent<HTMLInputElement>): void => {
    const title = e.target.value

    write((node) => {
      node.fileTitle = title
    })
  }

  const handleFileDesc = (e: ChangeEvent<HTMLInputElement>): void => {
    const desc = e.target.value

    write((node) => {
      node.fileCaption = desc
    })
  }

  return (
    <>
      <FileCard
        fileDesc={fileDesc}
        fileDescPlaceholder={fileDescPlaceholder ?? labels['file.desc.placeholder']}
        fileDragHandler={fileDragHandler}
        fileInputRef={fileInputRef}
        fileName={fileName}
        fileSize={fileSize}
        fileTitle={fileTitle}
        fileTitlePlaceholder={fileTitlePlaceholder ?? labels['file.title.placeholder']}
        fileUploader={uploader}
        handleFileDesc={handleFileDesc}
        handleFileTitle={handleFileTitle}
        isEditing={isEditing}
        isPopulated={isPopulated}
        onFileChange={onFileChange}
      />
      <CardActionToolbar editDataTestId="edit-file-upload-card" nodeKey={nodeKey} visibleWhen={isPopulated} />
    </>
  )
}

export default FileNodeComponent

export function renderFileCard(node: FileNode) {
  return (
    <FileNodeComponent
      fileDesc={node.fileCaption}
      fileName={node.fileName}
      fileSize={node.formattedFileSize}
      fileSrc={node.src}
      fileTitle={node.fileTitle}
      initialFile={node.__initialFile}
      nodeKey={node.getKey()}
      triggerFileDialog={node.__triggerFileDialog}
    />
  )
}
