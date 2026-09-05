import { type EditorState, type LexicalEditor, type NodeKey } from 'lexical'
import { useEffect } from 'react'

import type { HeaderNode } from '@/nodes/HeaderNode'

import { CardActionToolbar } from '@/components/ui/CardActionToolbar'
import { HeaderCard } from '@/components/ui/cards/HeaderCard/HeaderCard'
import { useCardIsEditing } from '@/context/CardSelectionStoreContext'
import { useInklingUploadSettings } from '@/context/InklingHostIntegrationContext'
import { useCardChrome } from '@/hooks/useCardChrome'
import { useHeaderBackgroundImage } from '@/hooks/useHeaderBackgroundImage'
import { useMediaCardUpload } from '@/hooks/useMediaCardUpload'
import usePinturaEditor from '@/hooks/usePinturaEditor'
import { headerFieldWriter } from '@/nodes/header/header-field-writer'
import { $isHeaderNode } from '@/nodes/HeaderNode'
import { headerBackgroundUploadIntent } from '@/nodes/upload-intent'

interface HeaderNodeComponentProps {
  alignment: string
  backgroundColor: string
  backgroundImageSrc: string
  backgroundImageWidth: number | null
  backgroundImageHeight: number | null
  backgroundSize: string
  buttonColor: string
  buttonText: string
  buttonTextColor: string
  buttonUrl: string
  buttonEnabled: boolean
  nodeKey: NodeKey
  headerTextEditor: LexicalEditor
  headerTextEditorInitialState?: EditorState | undefined
  layout: string
  subheaderTextEditor: LexicalEditor
  subheaderTextEditorInitialState?: EditorState | undefined
  textColor: string
  isSwapped: boolean
}

function HeaderNodeComponent({
  alignment,
  backgroundColor,
  backgroundImageSrc,
  backgroundImageWidth,
  backgroundImageHeight,
  backgroundSize,
  buttonColor,
  buttonText,
  buttonTextColor,
  buttonUrl,
  buttonEnabled,
  nodeKey,
  headerTextEditor,
  headerTextEditorInitialState,
  layout,
  subheaderTextEditor,
  subheaderTextEditorInitialState,
  textColor,
  isSwapped,
}: HeaderNodeComponentProps) {
  const { editor, write } = useCardChrome(nodeKey, $isHeaderNode)
  const { pinturaConfig } = useInklingUploadSettings()
  const isEditing = useCardIsEditing(nodeKey)

  const { isEnabled: isPinturaEnabled, openEditor: openImageEditor } = usePinturaEditor({
    config: pinturaConfig,
  })

  // the background-image show/hide/remove policy lives in the hook; the
  // component only supplies the node src, the write seam, and the file dialog
  const {
    showBackgroundImage,
    showImage: handleShowBackgroundImage,
    hideImage: handleHideBackgroundImage,
    clearImage: handleClearBackgroundImage,
    imageApplied,
  } = useHeaderBackgroundImage({
    layout,
    backgroundImageSrc,
    write,
    openFileDialog: () => fileInputRef.current?.click(),
  })

  // field-name-as-data write handlers (src/nodes/header/header-field-writer.ts)
  const field = headerFieldWriter(write)

  const handleAlignment = field.set('alignment')
  const handleBackgroundSize = field.set('backgroundSize')
  const handleLayout = field.set('layout')
  const handleTextColor = field.set('textColor')
  const handleButtonUrl = field.set('buttonUrl')
  const writeButtonText = field.set('buttonText')

  const handleButtonText = (event: React.ChangeEvent<HTMLInputElement>): void => {
    writeButtonText(event.target.value)
  }

  const handleButtonTextBlur = field.blurFallback('buttonText', '')
  const handleButtonUrlBlur = field.blurFallback('buttonUrl', 'https://')

  const handleButtonColor = field.setColorPair('buttonColor', 'buttonTextColor')
  const writeBackgroundColor = field.setColorPair('backgroundColor', 'textColor')

  const handleBackgroundColor = (color: string, matchingTextColor: string): void => {
    writeBackgroundColor(color, matchingTextColor)

    if (layout !== 'split') {
      handleHideBackgroundImage()
    }
  }

  const handleSwapLayout = field.toggle('swapped', isSwapped)
  const handleButtonEnabled = field.toggle('buttonEnabled', buttonEnabled)

  const {
    uploader: imageUploader,
    fileInputRef,
    dragHandler: imageDragHandler,
    onFileChange,
  } = useMediaCardUpload({
    kind: 'image',
    nodeKey,
    guard: $isHeaderNode,
    onFiles: async (files, upload) => {
      const imageSrc = await headerBackgroundUploadIntent({ editor, nodeKey, upload, files })
      imageApplied(imageSrc ?? '')
    },
  })

  useEffect(() => {
    headerTextEditor?.setEditable(isEditing)
    subheaderTextEditor?.setEditable(isEditing)
  }, [isEditing, headerTextEditor, subheaderTextEditor])

  return (
    <>
      <HeaderCard
        view={{
          alignment,
          backgroundColor,
          backgroundImageSrc,
          // the dataset admits arbitrary strings from older documents; the
          // card UI speaks fixed vocabularies, so narrow at the render
          // boundary with the node's own defaults (the callout color idiom)
          backgroundSize: backgroundSize === 'contain' ? 'contain' : 'cover',
          buttonColor,
          buttonEnabled,
          buttonText,
          buttonTextColor,
          buttonUrl,
          isEditing,
          isSwapped,
          layout: layout === 'regular' || layout === 'wide' || layout === 'split' ? layout : 'full',
          showBackgroundImage,
          textColor,
        }}
        handlers={{
          handleAlignment,
          handleBackgroundColor,
          handleBackgroundSize,
          handleButtonColor,
          handleButtonEnabled,
          handleButtonText,
          handleButtonTextBlur,
          handleButtonUrl,
          handleButtonUrlBlur,
          handleClearBackgroundImage,
          handleHideBackgroundImage,
          handleLayout,
          handleShowBackgroundImage,
          handleSwapLayout,
          handleTextColor,
        }}
        upload={{
          fileUploader: imageUploader,
          imageDragHandler,
          isPinturaEnabled,
          openImageEditor,
          setFileInputRef: (ref: { current?: HTMLInputElement | null }) => {
            fileInputRef.current = ref?.current ?? null
          },
          onFileChange,
        }}
        editors={{
          headerTextEditor,
          headerTextEditorInitialState,
          subheaderTextEditor,
          subheaderTextEditorInitialState,
        }}
      />
      <CardActionToolbar nodeKey={nodeKey} />
    </>
  )
}

export default HeaderNodeComponent

/**
 * Header's decorate render — the React-bearing half of its decorate-target,
 * paired with the declaration by `@/nodes/cards/card-decorate`.
 */
export function renderHeaderCard(node: HeaderNode) {
  return (
    <HeaderNodeComponent
      alignment={node.alignment}
      backgroundColor={node.backgroundColor}
      backgroundImageHeight={node.backgroundImageHeight}
      backgroundImageSrc={node.backgroundImageSrc}
      backgroundImageWidth={node.backgroundImageWidth}
      backgroundSize={node.backgroundSize}
      buttonColor={node.buttonColor}
      buttonEnabled={node.buttonEnabled}
      buttonText={node.buttonText}
      buttonTextColor={node.buttonTextColor}
      buttonUrl={node.buttonUrl}
      headerTextEditor={node.__headerTextEditor}
      headerTextEditorInitialState={node.__headerTextEditorInitialState}
      isSwapped={node.swapped}
      layout={node.layout}
      nodeKey={node.getKey()}
      subheaderTextEditor={node.__subheaderTextEditor}
      subheaderTextEditorInitialState={node.__subheaderTextEditorInitialState}
      textColor={node.textColor}
    />
  )
}
