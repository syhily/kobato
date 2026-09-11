import type { NodeKey } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

import GifSelector from '@/inkling/components/ui/GifSelector'
import { useInklingGifSettings } from '@/inkling/context/InklingHostIntegrationContext'
import { useGifBrowser } from '@/inkling/hooks/useGifBrowser'
import { useSelectorPlaceholderLifecycle } from '@/inkling/hooks/useSelectorPlaceholderLifecycle'
import { INSERT_FROM_GIF_COMMAND } from '@/inkling/plugins/InklingSelectorPlugin'
import { getGifProviderConfig, type GifProviderConfig } from '@/inkling/utils/services/gif'

interface GifPluginProps {
  nodeKey: NodeKey
}

const GifPlugin = ({ nodeKey }: GifPluginProps) => {
  const gifSettings = useInklingGifSettings()
  const providerConfig = getGifProviderConfig(gifSettings)

  // a host can enable the GIF menu item with a config object whose keys are
  // all missing (e.g. `{ tenor: {} }`), which resolves to no provider
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
    // a pick that lands after cancellation (the placeholder is gone) no-ops
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
