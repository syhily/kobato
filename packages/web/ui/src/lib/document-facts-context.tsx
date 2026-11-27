import type { AppLocale } from '@kobato/i18n/locales'
import type { BlogSettingsBundle } from '@kobato/settings/types'
import type { I18nMessages } from '@kobato/ui/lib/I18nProvider'
import type { ReactNode } from 'react'

import { createContext, use } from 'react'

export interface DocumentFontFace {
  family: string
  href: string
}

export interface DocumentFonts {
  global: readonly DocumentFontFace[]
  post: readonly DocumentFontFace[]
  code: readonly DocumentFontFace[]
}

export type DocumentLabels = Readonly<Record<string, string>>

export interface DocumentFacts {
  locale: AppLocale
  messages: I18nMessages
  revision?: string
  theme: 'dark' | 'light' | null
  fonts: DocumentFonts | null
  settings: BlogSettingsBundle | undefined
  nowIso?: string
  csrfToken?: string
  labels?: DocumentLabels
}

export interface DocumentFactsProviderProps {
  value: DocumentFacts
  children: ReactNode
}

const DocumentFactsContext = createContext<DocumentFacts | null>(null)

export function DocumentFactsProvider({ value, children }: DocumentFactsProviderProps) {
  return <DocumentFactsContext value={value}>{children}</DocumentFactsContext>
}

export function useDocumentFacts(): DocumentFacts {
  const facts = use(DocumentFactsContext)
  if (facts === null) {
    throw new Error('useDocumentFacts() requires the document shell: mount <DocumentShell> at the root route.')
  }
  return facts
}
