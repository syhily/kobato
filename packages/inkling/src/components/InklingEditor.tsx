import type { InklingSurfaceProps } from '@kobato/inkling-internal/components/InklingSurface'

import InklingSurface from '@kobato/inkling-internal/components/InklingSurface'
import { DEFAULT_TRANSFORMERS } from '@kobato/inkling-internal/markdown/transformers'
import { DefaultFeaturePlugins } from '@kobato/inkling-internal/plugins/DefaultFeaturePlugins'
import React from 'react'

export type InklingEditorProps = InklingSurfaceProps

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
