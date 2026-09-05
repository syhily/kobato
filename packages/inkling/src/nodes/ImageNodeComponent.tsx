import { type EditorState, type LexicalEditor, type NodeKey } from 'lexical'
import React from 'react'

import type { ImageNode } from '@/nodes/ImageNode'

import { ActionToolbar } from '@/components/ui/ActionToolbar'
import { CardActionToolbar, useCardToolbarLabel } from '@/components/ui/CardActionToolbar'
import { ImageCard } from '@/components/ui/cards/ImageCard'
import { LinkInput } from '@/components/ui/LinkInput'
import { useCardIsSelected } from '@/context/CardSelectionStoreContext'
import { useInklingHostEssentials, useInklingUploadSettings } from '@/context/InklingHostIntegrationContext'
import { useCardChrome } from '@/hooks/useCardChrome'
import useDropTarget from '@/hooks/useDropTarget'
import { useMediaCardUpload } from '@/hooks/useMediaCardUpload'
import usePinturaEditor from '@/hooks/usePinturaEditor'
import { isCardWidth, normalizeCardWidth, type CardWidth } from '@/nodes/base/utils/card-widths'
import { getAllowedImageCardWidths } from '@/nodes/base/utils/image-card-widths'
import { $isImageNode } from '@/nodes/ImageNode'
import { imageUploadIntent } from '@/nodes/upload-intent'
import { $selectCard } from '@/plugins/behaviour/card-adjacency'
import { applyImageCardDrop, isImageCardDropAllowed } from '@/plugins/behaviour/drop-surgery'
import { backfillImageDimensions, clampImageCardWidth, migrateImageDataUrl } from '@/plugins/behaviour/image-lifecycle'
import { isGif } from '@/utils/isGif'

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
  // resolved from the node's cardWidth by the declaration's decorateTarget
  // width mapper, so undo/redo and collab changes arrive as a new prop
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
        // reset original src on picker change so it can be replaced with
        // preview and upload progress (drops/initial/data-URL files keep it)
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
    // the container ref is the image wrapper itself, so :scope makes the
    // whole image card draggable/droppable for creating galleries
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

  // the mount-time document migrations (data:-URL upload, dimension
  // backfill, width clamp) live in @/plugins/behaviour/image-lifecycle
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

    // We only do this for init
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setHref = setField('href')

  const setAltText = setField('alt')

  const handleImageCardResize = React.useCallback(
    (newWidth: unknown) => {
      if (!isCardWidth(newWidth) || !allowedImageCardWidths.includes(newWidth)) {
        return
      }

      // the node write is enough: decorate() re-reads cardWidth on the commit
      // and the new width arrives as the cardWidth prop
      write((node) => {
        node.cardWidth = newWidth // this is a property on the node, not the card
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

  // selection repair after the link toolbar closes — through the one home
  // of the select-a-card operation; focus stays untouched ('never': the
  // toolbar's own close policy owns focus)
  const reselectImageCard = () => {
    editor.update(() => {
      $selectCard(editor, nodeKey, { focus: 'never' })
    })
  }

  // the link-input toolbar is a raw ActionToolbar (not a CardActionToolbar),
  // so it resolves the declaration's toolbar label itself
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

/**
 * Image's decorate render — the React-bearing half of its decorate-target,
 * paired with the declaration by `@/nodes/cards/card-decorate`.
 */
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
