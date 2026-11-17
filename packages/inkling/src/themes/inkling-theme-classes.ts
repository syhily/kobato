import type { EditorThemeClasses } from 'lexical'

/**
 * Inkling's custom theme keys. Upstream's EditorThemeClasses ends in an
 * upstream `[key: string]: any` index signature, so every read of these
 * keys is an unsafe-any cascade unless annotated at a boundary — this
 * interface is the boundary, and themeClassList is the one annotated read.
 */
export interface InklingThemeClasses extends EditorThemeClasses {
  atLink?: string
  atLinkIcon?: string
  atLinkSearch?: string
  tk?: string
  tkHighlighted?: string
}

export type InklingCustomThemeKey = 'atLink' | 'atLinkIcon' | 'atLinkSearch' | 'tk' | 'tkHighlighted'

/** Reads one custom theme key's classes as a list (empty-string entries dropped — classList.add('') throws). */
export function themeClassList(theme: EditorThemeClasses, key: InklingCustomThemeKey): string[] {
  // the literal key union resolves through the NAMED members (the upstream
  // index signature only poisons a general-string computed read — keyof
  // InklingThemeClasses would be `string` and hand the read back to any)
  const value = (theme as InklingThemeClasses)[key]
  return (value || '').split(' ').filter(Boolean)
}
