import type { InklingComposableEditorProps } from '@kobato/inkling-internal/components/InklingComposableEditor'

import InklingComposableEditor from '@kobato/inkling-internal/components/InklingComposableEditor'
import { SharedEditorStateContext } from '@kobato/inkling-internal/context/SharedEditorStateContext'
import React from 'react'

export type InklingSurfaceProps = InklingComposableEditorProps

const InklingSurface = ({ onChange, children, ...props }: InklingSurfaceProps) => {
  return (
    <SharedEditorStateContext onChange={onChange}>
      <InklingComposableEditor {...props}>{children}</InklingComposableEditor>
    </SharedEditorStateContext>
  )
}

export default InklingSurface
