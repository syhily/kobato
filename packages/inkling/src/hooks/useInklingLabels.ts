import React from 'react'

import type { InklingLabels } from '@/labels/inkling-labels'

import InklingUiPrefsContext from '@/context/InklingUiPrefsContext'

/** The resolved labels table — the composer's
 * merged overrides over the English defaults, or DEFAULT_LABELS outside a
 * composer. One line so the 30+ label-reading components never repeat the
 * context ceremony. */
export function useInklingLabels(): InklingLabels {
  return React.useContext(InklingUiPrefsContext).labels
}
