import { createContext, useContext } from 'react'

/**
 * Editor-level context — ported from Koenig's KoenigComposerContext.
 *
 * Provides editor-wide configuration that every card component may need:
 *   - `darkMode`: whether the dark theme is active (drives CodeMirror theme,
 *     card preview backgrounds, etc.)
 *
 * Snippet / visibility / cardConfig fields from Koenig are omitted — we
 * don't have those subsystems.
 */
export interface KoenigComposerContextValue {
  darkMode: boolean
}

const KoenigComposerContext = createContext<KoenigComposerContextValue>({ darkMode: false })

export const KoenigComposerContextProvider = KoenigComposerContext.Provider

export function useKoenigComposerContext(): KoenigComposerContextValue {
  return useContext(KoenigComposerContext)
}

export default KoenigComposerContext
