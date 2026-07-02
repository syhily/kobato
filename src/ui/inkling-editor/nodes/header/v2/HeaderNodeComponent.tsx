import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey, type EditorState, type LexicalEditor, type NodeKey } from 'lexical'
import { useContext, useEffect, useRef, useState } from 'react'

import { ActionToolbar } from '@/ui/inkling-editor/components/ui/ActionToolbar'
import { HeaderCard } from '@/ui/inkling-editor/components/ui/cards/HeaderCard/v2/HeaderCard'
import { SnippetCreateToolbar } from '@/ui/inkling-editor/components/ui/SnippetCreateToolbar'
import { ToolbarMenu, ToolbarMenuItem, ToolbarMenuSeparator } from '@/ui/inkling-editor/components/ui/ToolbarMenu'
import CardContext from '@/ui/inkling-editor/context/CardContext'
import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import useFileDragAndDrop from '@/ui/inkling-editor/hooks/useFileDragAndDrop'
import usePinturaEditor from '@/ui/inkling-editor/hooks/usePinturaEditor'
import { GeneratedDecoratorNodeBase } from '@/ui/inkling-editor/nodes/base'
import { EDIT_CARD_COMMAND } from '@/ui/inkling-editor/plugins/InklingBehaviourPlugin'
import { getAccentColor } from '@/ui/inkling-editor/utils/getAccentColor'
import { backgroundImageUploadHandler } from '@/ui/inkling-editor/utils/imageUploadHandler'
import { openFileSelection } from '@/ui/inkling-editor/utils/openFileSelection'

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
  header?: string
  headerTextEditor: LexicalEditor | null
  headerTextEditorInitialState?: EditorState | undefined
  headerTextEditorState?: EditorState | undefined
  layout: string
  subheader?: string
  subheaderTextEditor: LexicalEditor | null
  subheaderTextEditorInitialState?: EditorState | undefined
  subheaderTextEditorState?: EditorState | undefined
  textColor: string
  isSwapped: boolean
  accentColor?: string
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
  header,
  headerTextEditor,
  headerTextEditorInitialState,
  layout,
  subheader,
  subheaderTextEditor,
  subheaderTextEditorInitialState,
  textColor,
  isSwapped,
  accentColor,
}: HeaderNodeComponentProps) {
  const [editor] = useLexicalComposerContext()
  const { cardConfig, fileUploader } = useContext(InklingComposerContext)
  const { isEditing, isSelected } = useContext(CardContext)
  const [showSnippetToolbar, setShowSnippetToolbar] = useState<boolean>(false)
  const [showBackgroundImage, setShowBackgroundImage] = useState<boolean>(Boolean(backgroundImageSrc))
  const [lastBackgroundImage, setLastBackgroundImage] = useState<string>(backgroundImageSrc)

  // this is used to determine if the image was deliberately removed by the user or not, for some UX finesse
  const [imageRemoved, setImageRemoved] = useState<boolean>(false)

  const { isEnabled: isPinturaEnabled, openEditor: openImageEditor } = usePinturaEditor({
    config: cardConfig.pinturaConfig as Parameters<typeof usePinturaEditor>[0] extends { config?: infer C } ? C : never,
  })
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (layout !== 'split') {
      setShowBackgroundImage(Boolean(backgroundImageSrc))
    }

    if (layout === 'split' && !backgroundImageSrc && lastBackgroundImage) {
      handleShowBackgroundImage()
    }
    // We just want to reset the show background image state when the layout changes, not when the image changes
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [layout])

  useEffect(() => {
    const accent = getAccentColor()

    if (accent) {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node) {
          ;(node as GeneratedDecoratorNodeBase).accentColor = accent
        }
      })
    }
  }, [editor, nodeKey])

  const handleAlignment = (a: string): void => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) {
        ;(node as GeneratedDecoratorNodeBase).alignment = a
      }
    })
  }

  const handleBackgroundSize = (a: string): void => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) {
        ;(node as GeneratedDecoratorNodeBase).backgroundSize = a
      }
    })
  }

  const handleToolbarEdit = (event: React.MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    editor.dispatchCommand(EDIT_CARD_COMMAND, { cardKey: nodeKey, focusEditor: false })
  }

  const imageUploader = fileUploader.useFileUpload('image')

  const handleImageChange = async (files: FileList | File[] | null): Promise<void> => {
    // reset original src so it can be replaced with preview and upload progress
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) {
        ;(node as GeneratedDecoratorNodeBase).backgroundImageSrc = ''
      }
    })

    const bgResult = await backgroundImageUploadHandler(files, imageUploader.upload)
    const imageSrc = bgResult?.imageSrc ?? ''
    const width = bgResult?.width ?? 0
    const height = bgResult?.height ?? 0

    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) {
        const n = node as GeneratedDecoratorNodeBase
        n.backgroundImageSrc = imageSrc ?? ''
        n.backgroundImageWidth = width
        n.backgroundImageHeight = height
      }
    })

    setLastBackgroundImage(imageSrc ?? '')
    setImageRemoved(false)
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    await handleImageChange(e.target.files)
  }

  const imageDragHandler = useFileDragAndDrop({ handleDrop: handleImageChange })

  const handleLayout = (l: string): void => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) {
        ;(node as GeneratedDecoratorNodeBase).layout = l
      }
    })
  }

  const handleButtonText = (event: React.ChangeEvent<HTMLInputElement>): void => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) {
        ;(node as GeneratedDecoratorNodeBase).buttonText = event.target.value
      }
    })
  }

  const handleButtonTextBlur = (event: React.FocusEvent<HTMLInputElement>): void => {
    if (!event.target.value) {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node) {
          ;(node as GeneratedDecoratorNodeBase).buttonText = ''
        }
      })
    }
  }

  const handleClearBackgroundImage = (): void => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) {
        ;(node as GeneratedDecoratorNodeBase).backgroundImageSrc = ''
      }
    })
    setImageRemoved(true)
  }

  const handleShowBackgroundImage = (): void => {
    setShowBackgroundImage(true)

    if (lastBackgroundImage && !imageRemoved) {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node) {
          ;(node as GeneratedDecoratorNodeBase).backgroundImageSrc = lastBackgroundImage
        }
      })
    } else {
      openFileSelection({ fileInputRef })
    }
  }

  const handleHideBackgroundImage = (): void => {
    setShowBackgroundImage(false)
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) {
        ;(node as GeneratedDecoratorNodeBase).backgroundImageSrc = ''
      }
    })
  }

  const handleBackgroundColor = (color: string, matchingTextColor: string): void => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) {
        const n = node as GeneratedDecoratorNodeBase
        n.backgroundColor = color
        n.textColor = matchingTextColor

        if (layout !== 'split') {
          handleHideBackgroundImage()
        }
      }
    })
  }

  const handleTextColor = (color: string): void => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) {
        ;(node as GeneratedDecoratorNodeBase).textColor = color
      }
    })
  }

  const handleButtonColor = (color: string, matchingTextColor: string): void => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) {
        const n = node as GeneratedDecoratorNodeBase
        n.buttonColor = color
        n.buttonTextColor = matchingTextColor
      }
    })
  }

  const handleSwapLayout = (): void => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) {
        ;(node as GeneratedDecoratorNodeBase).swapped = !isSwapped
      }
    })
  }

  const handleButtonEnabled = (): void => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) {
        ;(node as GeneratedDecoratorNodeBase).buttonEnabled = !buttonEnabled
      }
    })
  }

  const handleButtonUrl = (val: string): void => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) {
        ;(node as GeneratedDecoratorNodeBase).buttonUrl = val
      }
    })
  }

  const handleButtonUrlBlur = (event: React.FocusEvent<HTMLInputElement>): void => {
    if (!event.target.value) {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node) {
          ;(node as GeneratedDecoratorNodeBase).buttonUrl = 'https://'
        }
      })
    }
  }

  useEffect(() => {
    headerTextEditor?.setEditable(isEditing)
    subheaderTextEditor?.setEditable(isEditing)
  }, [isEditing, headerTextEditor, subheaderTextEditor])

  return (
    <>
      {/* oxlint-disable-next-line typescript/no-explicit-any */}
      <HeaderCard
        {...({
          alignment,
          backgroundColor,
          backgroundImageSrc,
          backgroundSize,
          buttonColor,
          buttonEnabled,
          buttonText,
          buttonTextColor,
          buttonUrl,
          fileUploader: imageUploader,
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
          header,
          headerTextEditor,
          headerTextEditorInitialState,
          imageDragHandler,
          isEditing,
          isPinturaEnabled,
          isSwapped,
          layout,
          openImageEditor,
          setFileInputRef: (ref: { current?: HTMLInputElement | null }) => {
            fileInputRef.current = ref?.current ?? null
          },
          showBackgroundImage,
          subheader,
          subheaderTextEditor,
          subheaderTextEditorInitialState,
          textColor,
          onFileChange,
          // oxlint-disable-next-line typescript/no-explicit-any
        } as any)}
      />
      <ActionToolbar data-inkling-card-toolbar="signup" isVisible={showSnippetToolbar}>
        <SnippetCreateToolbar nodeKey={nodeKey} onClose={() => setShowSnippetToolbar(false)} />
      </ActionToolbar>

      <ActionToolbar data-inkling-card-toolbar="signup" isVisible={isSelected && !isEditing && !showSnippetToolbar}>
        <ToolbarMenu>
          <ToolbarMenuItem icon="edit" isActive={false} label="Edit" onClick={handleToolbarEdit} />
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

export default HeaderNodeComponent
