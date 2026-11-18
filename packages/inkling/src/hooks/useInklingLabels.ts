import type { InklingLabels } from '@kobato/inkling-internal/labels/inkling-labels'

import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import React from 'react'

/** The resolved labels table — the composer's merged overrides over the English
 * defaults, or DEFAULT_LABELS outside a composer. Host-namespace
 * (`menu.host.*`) overrides ride the merged object at runtime; the closed
 * return type can't name them. */
export function useInklingLabels(): InklingLabels {
  return React.useContext(InklingUiPrefsContext).labels
}
