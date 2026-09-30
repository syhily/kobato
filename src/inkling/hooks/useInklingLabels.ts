import React from 'react'

import type { InklingLabels } from '@/inkling/labels/inkling-labels'

import InklingUiPrefsContext from '@/inkling/context/InklingUiPrefsContext'

/** The resolved labels table — the composer's
 * merged overrides over the English defaults, or DEFAULT_LABELS outside a
 * composer. Host-namespace (`menu.host.*`) overrides ride the merged object
 * at runtime; the closed return type can't name them. One line so the 30+
 * label-reading components never repeat the
 * context ceremony. */
export function useInklingLabels(): InklingLabels {
  return React.useContext(InklingUiPrefsContext).labels
}
