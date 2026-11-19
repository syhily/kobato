import type { ImageNode } from '@kobato/inkling-internal/nodes/ImageNode'

import { ActionToolbar } from '@kobato/inkling-internal/components/ui/ActionToolbar'
import { CardActionToolbar, useCardToolbarLabel } from '@kobato/inkling-internal/components/ui/CardActionToolbar'
import { ImageCard } from '@kobato/inkling-internal/components/ui/cards/ImageCard'
import { LinkInput } from '@kobato/inkling-internal/components/ui/LinkInput'
import { useCardIsSelected } from '@kobato/inkling-internal/context/CardSelectionStoreContext'
import {
  useInklingHostEssentials,
  useInklingUploadSettings,
} from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import { useCardChrome } from '@kobato/inkling-internal/hooks/useCardChrome'
import useDropTarget from '@kobato/inkling-internal/hooks/useDropTarget'
import { useMediaCardUpload } from '@kobato/inkling-internal/hooks/useMediaCardUpload'
import usePinturaEditor from '@kobato/inkling-internal/hooks/usePinturaEditor'
import { isCardWidth, normalizeCardWidth, type CardWidth } from '@kobato/inkling-internal/nodes/base/utils/card-widths'
import { getAllowedImageCardWidths } from '@kobato/inkling-internal/nodes/base/utils/image-card-widths'
import { $isImageNode } from '@kobato/inkling-internal/nodes/ImageNode'
import { imageUploadIntent } from '@kobato/inkling-internal/nodes/upload-intent'
import { $selectCard } from '@kobato/inkling-internal/plugins/behaviour/card-adjacency'
import { applyImageCardDrop, isImageCardDropAllowed } from '@kobato/inkling-internal/plugins/behaviour/drop-surgery'
import {
  backfillImageDimensions,
  clampImageCardWidth,
  migrateImageDataUrl,
} from '@kobato/inkling-internal/plugins/behaviour/image-lifecycle'
import { isGif } from '@kobato/inkling-internal/utils/is-gif'
import { type EditorState, type LexicalEditor, type NodeKey } from 'lexical'
import React from 'react'

export interface ImageNodeComponentProps {
  nodeKey: NodeKey
  initialFile?: File
  src: string
  altText?: string
  captionEditor?: LexicalEditor
  captionEditorInitialState?: EditorState
  triggerFileDialog?: boolean
  previewSrc?: string | null
  href?: string
  cardWidth: CardWidth
}

export function ImageNodeComponent({
  nodeKey,
  initialFile,
  src,
  altText,
  captionEditor,
  captionEditorInitialState,
  triggerFileDialog,
  previewSrc,
  href,
  cardWidth,
}: ImageNodeComponentProps) {
  const { editor, write, setField } = useCardChrome(nodeKey, $isImageNode)
  const { onError } = useInklingHostEssentials()
  const uploadSettings = useInklingUploadSettings()
  const [showLink, setShowLink] = React.useState(false)
  const isSelected = useCardIsSelected(nodeKey)

  const {
    uploader: imageUploader,
    fileInputRef,
    dragHandler: imageFileDragHandler,
    onFileChange,
    runFiles,
  } = useMediaCardUpload({
    kind: 'image',
    nodeKey,
    guard: $isImageNode,
    initialFile,
    isReady: () => !src,
    triggerFileDialog,
    onFiles: (files, upload, source) =>
      imageUploadIntent({
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

  const imageCardDragHandler = useDropTarget({
    canDrop: (draggable) => isImageCardDropAllowed(draggable, nodeKey),
    draggableSelector: ':scope',
    droppableSelector: ':scope',
    onDrop: (draggable) => {
      applyImageCardDrop(editor, nodeKey, draggable)
      return undefined
    },
  })

  const { isEnabled: isPinturaEnabled, openEditor: openImageEditor } = usePinturaEditor({
    config: uploadSettings.pinturaConfig,
  })

  const allowedImageCardWidths = React.useMemo(() => {
    return getAllowedImageCardWidths(uploadSettings.image?.allowedWidths)
  }, [uploadSettings.image?.allowedWidths])
  const hasMultipleImageCardWidths = allowedImageCardWidths.length > 1

  React.useEffect(() => {
    let isMounted = true
    void migrateImageDataUrl(
      { src, isLoading: imageUploader.isLoading, isCancelled: () => !isMounted },
      { runUpload: (file) => runFiles([file], 'initial'), onError: (error) => onError(error, {}) },
    )
    return () => {
      isMounted = false
    }
  }, [imageUploader.isLoading, onError, src, runFiles])

  React.useEffect(() => {
    void backfillImageDimensions(
      editor,
      nodeKey,
      { src, initialFile, triggerFileDialog },
      { write, onError: (error) => onError(error, {}) },
    )

    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const setHref = setField('href')

  const setAltText = setField('alt')

  const handleImageCardResize = React.useCallback(
    (newWidth: unknown) => {
      if (!isCardWidth(newWidth) || !allowedImageCardWidths.includes(newWidth)) {
        return
      }

      write((node) => {
        node.cardWidth = newWidth
      })
    },
    [allowedImageCardWidths, write],
  )

  React.useEffect(() => {
    clampImageCardWidth(cardWidth, allowedImageCardWidths, { write })
  }, [allowedImageCardWidths, cardWidth, write])

  const cancelLinkAndReselect = () => {
    setShowLink(false)
    reselectImageCard()
  }

  const reselectImageCard = () => {
    editor.update(() => {
      $selectCard(editor, nodeKey, { focus: 'never' })
    })
  }

  const toolbarLabel = useCardToolbarLabel(nodeKey)

  return (
    <>
      <ImageCard
        altText={altText}
        captionEditor={captionEditor ?? null}
        captionEditorInitialState={captionEditorInitialState}
        cardWidth={cardWidth}
        fileInputRef={fileInputRef}
        imageCardDragHandler={imageCardDragHandler}
        imageFileDragHandler={imageFileDragHandler}
        imageUploader={imageUploader}
        isPinturaEnabled={isPinturaEnabled}
        isSelected={isSelected}
        openImageEditor={openImageEditor}
        previewSrc={previewSrc}
        setAltText={setAltText}
        src={src}
        onFileChange={onFileChange}
      />

      <ActionToolbar data-inkling-card-toolbar={toolbarLabel} isVisible={showLink}>
        <LinkInput
          cancel={cancelLinkAndReselect}
          href={href}
          update={(_href: string) => {
            setHref(_href)
            cancelLinkAndReselect()
          }}
        />
      </ActionToolbar>

      <CardActionToolbar
        hideWhileEditing={false}
        items={[
          {
            kind: 'custom',
            hide: isGif(src) || !hasMultipleImageCardWidths || !allowedImageCardWidths.includes('regular'),
            icon: 'imgRegular',
            isActive: cardWidth === 'regular',
            label: 'Regular width',
            onClick: () => handleImageCardResize('regular'),
          },
          {
            kind: 'custom',
            hide: isGif(src) || !hasMultipleImageCardWidths || !allowedImageCardWidths.includes('wide'),
            icon: 'imgWide',
            isActive: cardWidth === 'wide',
            label: 'Wide width',
            onClick: () => handleImageCardResize('wide'),
          },
          {
            kind: 'custom',
            hide: isGif(src) || !hasMultipleImageCardWidths || !allowedImageCardWidths.includes('full'),
            icon: 'imgFull',
            isActive: cardWidth === 'full',
            label: 'Full width',
            onClick: () => handleImageCardResize('full'),
          },
          { kind: 'separator', hide: isGif(src) || !hasMultipleImageCardWidths },
          {
            kind: 'custom',
            icon: 'link',
            isActive: !!href,
            label: 'Link',
            onClick: () => {
              setShowLink(true)
            },
          },
          { kind: 'separator' },
          { kind: 'snippet' },
        ]}
        nodeKey={nodeKey}
        visibleWhen={!!src && !showLink}
      />
    </>
  )
}

export function renderImageCard(node: ImageNode) {
  const Selector = node.__selector
  const cardWidth = normalizeCardWidth(node.cardWidth) ?? 'regular'

  return (
    <>
      {Selector && <Selector nodeKey={node.getKey()} />}
      {!node.__isImageHidden && (
        <ImageNodeComponent
          altText={node.alt}
          captionEditor={node.__captionEditor}
          captionEditorInitialState={node.__captionEditorInitialState}
          cardWidth={cardWidth}
          href={node.href}
          initialFile={node.__initialFile}
          nodeKey={node.getKey()}
          previewSrc={node.previewSrc ?? undefined}
          src={node.src}
          triggerFileDialog={node.__triggerFileDialog}
        />
      )}
    </>
  )
}
