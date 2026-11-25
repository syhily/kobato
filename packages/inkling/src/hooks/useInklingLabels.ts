import type { InklingLabels } from '@kobato/inkling-internal/labels/inkling-labels'

import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import { useContext } from 'react'
export function useInklingLabels(): InklingLabels {
  return useContext(InklingUiPrefsContext).labels
}
