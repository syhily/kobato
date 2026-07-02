import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createNodeSelection, $getNodeByKey, $setSelection, type NodeKey } from 'lexical'
import React from 'react'

import type { DraggableInfo } from '@/ui/inkling-editor/utils/draggable/DragDropContainer'

import { ActionToolbar } from '@/ui/inkling-editor/components/ui/ActionToolbar'
import { ImageCard } from '@/ui/inkling-editor/components/ui/cards/ImageCard'
import { ImageUploadForm } from '@/ui/inkling-editor/components/ui/ImageUploadForm'
import { LinkInput } from '@/ui/inkling-editor/components/ui/LinkInput'
import { SnippetCreateToolbar } from '@/ui/inkling-editor/components/ui/SnippetCreateToolbar'
import { ToolbarMenu, ToolbarMenuItem, ToolbarMenuSeparator } from '@/ui/inkling-editor/components/ui/ToolbarMenu'
import CardContext from '@/ui/inkling-editor/context/CardContext'
import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import useCardDragAndDrop from '@/ui/inkling-editor/hooks/useCardDragAndDrop'
import useFileDragAndDrop from '@/ui/inkling-editor/hooks/useFileDragAndDrop'
import usePinturaEditor, { type PinturaConfig } from '@/ui/inkling-editor/hooks/usePinturaEditor'
import { $createGalleryNode } from '@/ui/inkling-editor/nodes/GalleryNode'
import { $isImageNode } from '@/ui/inkling-editor/nodes/ImageNode'
import { dataSrcToFile } from '@/ui/inkling-editor/utils/dataSrcToFile'
import { getImageDimensions } from '@/ui/inkling-editor/utils/getImageDimensions'
import { getImageFilenameFromSrc } from '@/ui/inkling-editor/utils/getImageFilenameFromSrc'
import { getAllowedImageCardWidths, getDefaultImageCardWidth } from '@/ui/inkling-editor/utils/image-card-widths'
import { imageUploadHandler } from '@/ui/inkling-editor/utils/imageUploadHandler'
import { isGif } from '@/ui/inkling-editor/utils/isGif'
import { openFileSelection } from '@/ui/inkling-editor/utils/openFileSelection'

export interface ImageNodeComponentProps {
  nodeKey: NodeKey
  initialFile?: File
  src: string
  altText?: string
  captionEditor?: import('lexical').LexicalEditor
  captionEditorInitialState?: import('lexical').EditorState
  triggerFileDialog?: boolean
  previewSrc?: string | null
  href?: string
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
}: ImageNodeComponentProps) {
  const [editor] = useLexicalComposerContext()
  const [showLink, setShowLink] = React.useState(false)
  const { fileUploader, cardConfig } = React.useContext(InklingComposerContext)
  const { isSelected, cardWidth, setCardWidth } = React.useContext(CardContext)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const toolbarFileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [showSnippetToolbar, setShowSnippetToolbar] = React.useState(false)

  const imageUploader = fileUploader.useFileUpload('image')

  const onDropImageCard = React.useCallback(
    (draggable: DraggableInfo): boolean | undefined => {
      const { type, cardName, dataset } = draggable
      const draggedNodeKey = draggable.nodeKey as string | undefined

      if (type === 'card' && cardName === 'image' && draggedNodeKey && dataset) {
        editor.update(() => {
          const targetImageNode = $getNodeByKey(nodeKey)
          const droppedImageNode = $getNodeByKey(draggedNodeKey)

          if (!$isImageNode(targetImageNode) || !$isImageNode(droppedImageNode)) {
            return
          }

          const galleryNode = $createGalleryNode({})

          // images don't contain the filename dataset property so we need to add it
          dataset.fileName = (dataset?.fileName as string | undefined) || getImageFilenameFromSrc(String(dataset.src))
          const targetImageDataset = targetImageNode.getDataset()
          targetImageDataset.fileName =
            (targetImageDataset?.fileName as string | undefined) ||
            getImageFilenameFromSrc(String(targetImageDataset.src))

          galleryNode.addImages([targetImageDataset, dataset])

          targetImageNode.replace(galleryNode)
          droppedImageNode.remove()
        })
      }

      return undefined
    },
    [editor, nodeKey],
  )

  const canDropImageCard = React.useCallback(
    (draggable: DraggableInfo): boolean => {
      const draggedNodeKey = draggable.nodeKey as string | undefined
      return draggable.type === 'card' && draggable.cardName === 'image' && draggedNodeKey !== nodeKey
    },
    [nodeKey],
  )

  const imageFileDragHandler = useFileDragAndDrop({ handleDrop: handleImageDrop })
  const imageCardDragHandler = useCardDragAndDrop({
    canDrop: canDropImageCard,
    // the container ref is the image wrapper itself, so :scope makes the
    // whole image card draggable/droppable for creating galleries
    draggableSelector: ':scope',
    droppableSelector: ':scope',
    onDrop: onDropImageCard,
  })

  const { isEnabled: isPinturaEnabled, openEditor: openImageEditor } = usePinturaEditor({
    config: cardConfig.pinturaConfig as PinturaConfig | undefined,
  })

  const allowedImageCardWidths = React.useMemo(() => {
    return getAllowedImageCardWidths(cardConfig?.image?.allowedWidths)
  }, [cardConfig?.image?.allowedWidths])
  const defaultImageCardWidth = React.useMemo(() => {
    return getDefaultImageCardWidth(allowedImageCardWidths)
  }, [allowedImageCardWidths])
  const hasMultipleImageCardWidths = allowedImageCardWidths.length > 1

  React.useEffect(() => {
    if (!src?.startsWith('data:') || imageUploader.isLoading) {
      return undefined
    }

    let isMounted = true

    // When copy/pasting from Google Docs it's possible for images to be transferred with data: URLs.
    // Convert `data:` URL to File and upload it
    const uploadFile = async () => {
      const file = await dataSrcToFile(src)
      if (isMounted && file) {
        await imageUploadHandler([file], nodeKey, editor, imageUploader.upload)
      }
    }

    uploadFile()

    return () => {
      isMounted = false
    }
  }, [editor, imageUploader.isLoading, imageUploader.upload, nodeKey, src])

  React.useEffect(() => {
    // If an initial file is provided, upload it
    const uploadInitialFile = async (file: File) => {
      if (file && !src) {
        await imageUploadHandler([file], nodeKey, editor, imageUploader.upload)
      }
    }

    if (initialFile) {
      uploadInitialFile(initialFile)
    }

    // Populate missing image dimensions, occurs when images are
    // pasted/dragged/inserted as external or when loaded from serialized
    // state that has missing images
    const populateImageDimensions = async () => {
      if (src && !initialFile && !triggerFileDialog) {
        const { width, height } = await getImageDimensions(src)
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if ($isImageNode(node)) {
            node.width = width
            node.height = height
          }
        })
      }
    }

    const hasMissingDimensions = editor.getEditorState().read(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isImageNode(node) && (!node.width || !node.height)) {
        return true
      }
      return false
    })

    if (hasMissingDimensions) {
      populateImageDimensions()
    }

    // We only do this for init
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement> | { target: { files: File[] } }) => {
    const files = e.target.files

    if (!files || files.length === 0) {
      return
    }

    // reset original src so it can be replaced with preview and upload progress
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isImageNode(node)) {
        node.src = ''
      }
    })

    return await imageUploadHandler(files, nodeKey, editor, imageUploader.upload)
  }

  const setHref = (newHref: string) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isImageNode(node)) {
        node.href = newHref
      }
    })
  }

  const setAltText = (newAltText: string) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isImageNode(node)) {
        node.alt = newAltText
      }
    })
  }

  // when card is inserted from the card menu or slash command we want to show the file picker immediately
  // uses a setTimeout to avoid issues with React rendering the component twice in dev mode 🙈
  React.useEffect(() => {
    if (!triggerFileDialog) {
      return
    }

    const renderTimeout = setTimeout(() => {
      // trigger dialog
      openFileSelection({ fileInputRef })

      // clear the property on the node so we don't accidentally trigger anything with a re-render
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isImageNode(node)) {
          node.triggerFileDialog = false
        }
      })
    })

    return () => {
      clearTimeout(renderTimeout)
    }
  })

  const handleImageCardResize = React.useCallback(
    (newWidth: string) => {
      if (!allowedImageCardWidths.includes(newWidth)) {
        return
      }

      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isImageNode(node)) {
          node.cardWidth = newWidth // this is a property on the node, not the card
          setCardWidth(newWidth) // sets the state of the toolbar component
        }
      })
    },
    [allowedImageCardWidths, editor, nodeKey, setCardWidth],
  )

  React.useEffect(() => {
    if (!allowedImageCardWidths.includes(cardWidth)) {
      handleImageCardResize(defaultImageCardWidth)
    }
  }, [allowedImageCardWidths, cardWidth, defaultImageCardWidth, handleImageCardResize])

  const cancelLinkAndReselect = () => {
    setShowLink(false)
    reselectImageCard()
  }

  const reselectImageCard = () => {
    editor.update(() => {
      const nodeSelection = $createNodeSelection()
      nodeSelection.add(nodeKey)
      $setSelection(nodeSelection)
    })
  }

  async function handleImageDrop(files: File[]) {
    await imageUploadHandler(files, nodeKey, editor, imageUploader.upload)
  }

  const setFigureRef = React.useCallback(() => {
    // no-op: ImageNodeComponent does not need the figure ref
  }, [])

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
        setFigureRef={setFigureRef}
        src={src}
        onFileChange={onFileChange}
      />

      <ActionToolbar data-inkling-card-toolbar="image" isVisible={showLink}>
        <LinkInput
          cancel={cancelLinkAndReselect}
          href={href}
          update={(_href: string) => {
            setHref(_href)
            cancelLinkAndReselect()
          }}
        />
      </ActionToolbar>

      <ActionToolbar data-inkling-card-toolbar="image" isVisible={showSnippetToolbar}>
        <SnippetCreateToolbar nodeKey={nodeKey} onClose={() => setShowSnippetToolbar(false)} />
      </ActionToolbar>

      <ActionToolbar
        data-inkling-card-toolbar="image"
        isVisible={!!src && isSelected && !showLink && !showSnippetToolbar}
      >
        <ImageUploadForm
          fileInputRef={toolbarFileInputRef}
          mimeTypes={fileUploader.fileTypes?.image?.mimeTypes ?? []}
          onFileChange={onFileChange}
        />
        <ToolbarMenu>
          <ToolbarMenuItem
            hide={isGif(src) || !hasMultipleImageCardWidths || !allowedImageCardWidths.includes('regular')}
            icon="imgRegular"
            isActive={cardWidth === 'regular'}
            label="Regular width"
            onClick={() => handleImageCardResize('regular')}
          />
          <ToolbarMenuItem
            hide={isGif(src) || !hasMultipleImageCardWidths || !allowedImageCardWidths.includes('wide')}
            icon="imgWide"
            isActive={cardWidth === 'wide'}
            label="Wide width"
            onClick={() => handleImageCardResize('wide')}
          />
          <ToolbarMenuItem
            hide={isGif(src) || !hasMultipleImageCardWidths || !allowedImageCardWidths.includes('full')}
            icon="imgFull"
            isActive={cardWidth === 'full'}
            label="Full width"
            onClick={() => handleImageCardResize('full')}
          />
          <ToolbarMenuSeparator hide={isGif(src) || !hasMultipleImageCardWidths} />
          <ToolbarMenuItem
            icon="link"
            isActive={!!href}
            label="Link"
            onClick={() => {
              setShowLink(true)
            }}
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
