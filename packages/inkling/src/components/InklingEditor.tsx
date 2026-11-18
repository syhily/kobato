import type { InklingSurfaceProps } from '@kobato/inkling-internal/components/InklingSurface'

import InklingSurface from '@kobato/inkling-internal/components/InklingSurface'
import { DEFAULT_TRANSFORMERS } from '@kobato/inkling-internal/markdown/transformers'
import { DefaultFeaturePlugins } from '@kobato/inkling-internal/plugins/DefaultFeaturePlugins'
import React from 'react'

export type InklingEditorProps = InklingSurfaceProps

// DEFAULT_TRANSFORMERS is pinned here (not left to MarkdownShortcutPlugin's
// default): the plugin's default is the card-free MINIMAL set, and the article
// surface keeps the full shortcut set.
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
