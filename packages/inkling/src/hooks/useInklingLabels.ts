import type { InklingLabels } from '@kobato/inkling-internal/labels/inkling-labels'

import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import React from 'react'

export function useInklingLabels(): InklingLabels {
  return React.useContext(InklingUiPrefsContext).labels
}
