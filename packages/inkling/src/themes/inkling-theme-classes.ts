import type { EditorThemeClasses } from 'lexical'

export interface InklingThemeClasses extends EditorThemeClasses {
  atLink?: string
  atLinkIcon?: string
  atLinkSearch?: string
  tk?: string
  tkHighlighted?: string
}

export type InklingCustomThemeKey = 'atLink' | 'atLinkIcon' | 'atLinkSearch' | 'tk' | 'tkHighlighted'

export function themeClassList(theme: EditorThemeClasses, key: InklingCustomThemeKey): string[] {
  const value = (theme as InklingThemeClasses)[key]
  return (value || '').split(' ').filter(Boolean)
}
