import '@/styles/index.css'
import React from 'react'

import type { InklingSurfaceProps } from '@/components/InklingSurface'

import InklingSurface from '@/components/InklingSurface'
import { DEFAULT_TRANSFORMERS } from '@/markdown/transformers'
import { DefaultFeaturePlugins } from '@/plugins/DefaultFeaturePlugins'

export type InklingEditorProps = InklingSurfaceProps

// DEFAULT_TRANSFORMERS is pinned here (not left to MarkdownShortcutPlugin's
// default): the plugin's default is the card-free MINIMAL set, and the `.`
// surface keeps the full shortcut set (plan C5).
const InklingEditor = ({ children, markdownTransformers = DEFAULT_TRANSFORMERS, ...props }: InklingEditorProps) => {
  return (
    <InklingSurface markdownTransformers={markdownTransformers} {...props}>
      <DefaultFeaturePlugins />
      {children}
    </InklingSurface>
  )
}

export default InklingEditor
