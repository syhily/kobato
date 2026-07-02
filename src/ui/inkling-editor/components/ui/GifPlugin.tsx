import type { NodeKey } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

import GifSelector from '@/ui/inkling-editor/components/ui/GifSelector'
import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import { DELETE_CARD_COMMAND } from '@/ui/inkling-editor/plugins/InklingBehaviourPlugin'
import { INSERT_FROM_GIF_COMMAND } from '@/ui/inkling-editor/plugins/InklingSelectorPlugin'
import { getGifProviderConfig, useGif } from '@/ui/inkling-editor/utils/services/gif'

interface GifPluginProps {
  nodeKey: NodeKey
}

const GifPlugin = ({ nodeKey }: GifPluginProps) => {
  const { cardConfig } = React.useContext(InklingComposerContext)
  const providerConfig = getGifProviderConfig(cardConfig)
  const gifHook = useGif({ config: providerConfig! })
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        editor.dispatchCommand(DELETE_CARD_COMMAND, { cardKey: nodeKey })
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }

    // We only do this for init
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onClickOutside = () => {
    editor.dispatchCommand(DELETE_CARD_COMMAND, { cardKey: nodeKey })
  }

  const insertImageToNode = async (image: { src: string; width: number; height: number }) => {
    // oxlint-disable-next-line typescript/no-explicit-any
    editor.dispatchCommand(INSERT_FROM_GIF_COMMAND, image as any)
  }

  return (
    <GifSelector
      provider={providerConfig?.provider}
      onClickOutside={onClickOutside}
      onGifInsert={insertImageToNode}
      {...gifHook}
    />
  )
}

export default GifPlugin
