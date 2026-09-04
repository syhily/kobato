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
//
// `alignment` defaults on for the article surface: it keeps element `format`
// through the default transforms AND exposes the floating toolbar's alignment
// group (tiptap `TextAlign.configure({ types: ['heading', 'paragraph',
// 'blockquote'] })` parity). The card-free `./core` surface composes
// InklingSurface directly, so it keeps the strip default.
const InklingEditor = ({
  children,
  markdownTransformers = DEFAULT_TRANSFORMERS,
  alignment = true,
  ...props
}: InklingEditorProps) => {
  return (
    <InklingSurface markdownTransformers={markdownTransformers} alignment={alignment} {...props}>
      <DefaultFeaturePlugins />
      {children}
    </InklingSurface>
  )
}

export default InklingEditor
