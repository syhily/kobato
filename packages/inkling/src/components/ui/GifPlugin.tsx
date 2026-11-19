import type { NodeKey } from 'lexical'

import GifSelector from '@kobato/inkling-internal/components/ui/GifSelector'
import { useInklingGifSettings } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import { useGifBrowser } from '@kobato/inkling-internal/hooks/useGifBrowser'
import { useSelectorPlaceholderLifecycle } from '@kobato/inkling-internal/hooks/useSelectorPlaceholderLifecycle'
import { INSERT_FROM_GIF_COMMAND } from '@kobato/inkling-internal/plugins/InklingSelectorPlugin'
import { getGifProviderConfig, type GifProviderConfig } from '@kobato/inkling-internal/services/gif'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

interface GifPluginProps {
  nodeKey: NodeKey
}

const GifPlugin = ({ nodeKey }: GifPluginProps) => {
  const gifSettings = useInklingGifSettings()
  const providerConfig = getGifProviderConfig(gifSettings)

  if (!providerConfig) {
    return null
  }

  return <GifPluginSelector nodeKey={nodeKey} providerConfig={providerConfig} />
}

const GifPluginSelector = ({ nodeKey, providerConfig }: { nodeKey: NodeKey; providerConfig: GifProviderConfig }) => {
  const browser = useGifBrowser({ config: providerConfig })
  const [editor] = useLexicalComposerContext()
  const { closeSelector, placeholderExists } = useSelectorPlaceholderLifecycle(nodeKey)

  const insertImageToNode = (image: { src: string; width: number; height: number }) => {
    if (!placeholderExists()) {
      return
    }
    editor.dispatchCommand(INSERT_FROM_GIF_COMMAND, image)
  }

  return (
    <GifSelector
      browser={browser}
      provider={providerConfig.provider}
      onClickOutside={closeSelector}
      onGifInsert={insertImageToNode}
    />
  )
}

export default GifPlugin
