import { type NodeKey } from 'lexical'
import React from 'react'

import type { FileNode } from '@/nodes/FileNode'

import { CardActionToolbar } from '@/components/ui/CardActionToolbar'
import { FileCard } from '@/components/ui/cards/FileCard'
import { useCardIsEditing } from '@/context/CardSelectionStoreContext'
import { useCardChrome } from '@/hooks/useCardChrome'
import { useInklingLabels } from '@/hooks/useInklingLabels'
import { useMediaCardUpload } from '@/hooks/useMediaCardUpload'
import { $isFileNode } from '@/nodes/base'
import { fileUploadIntent } from '@/nodes/upload-intent'

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
  // populated is a latch (below); a card MOUNTED with a complete file never
  // transitions, so the initial state must start populated
  const [isPopulated, setIsPopulated] = React.useState<boolean>(() => !!(fileSrc && fileSize && fileName))
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
        // reset original src on picker change so it can be replaced with
        // preview and upload progress (drops/initial files keep it)
        prePatch:
          source === 'input'
            ? (node) => {
                node.src = ''
              }
            : undefined,
      }),
  })

  // populated is a latch: once the card has a complete file it stays populated
  // (a later picker change clears src again, but the card must not flip back).
  // Adjusted during render — React re-renders immediately, before committing
  const isComplete = !!(fileSrc && fileSize && fileName)
  const [prevComplete, setPrevComplete] = React.useState(isComplete)
  if (prevComplete !== isComplete) {
    setPrevComplete(isComplete)
    if (isComplete) {
      setIsPopulated(true)
    }
  }

  const handleFileTitle = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const title = e.target.value

    write((node) => {
      node.fileTitle = title
    })
  }

  const handleFileDesc = (e: React.ChangeEvent<HTMLInputElement>): void => {
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

/**
 * File's decorate render — the React-bearing half of its decorate-target,
 * paired with the declaration by `@/nodes/cards/card-decorate`.
 */
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
