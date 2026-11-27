import type { ReactNode } from 'react'

import { LazyMotionConfig } from '@kobato/ui/components/lazy-motion'
import { BlogSettingsProvider } from '@kobato/ui/lib/blog-settings-context'
import { useDocumentFacts } from '@kobato/ui/lib/document-facts-context'
import { LocaleSyncProvider } from '@kobato/ui/lib/LocaleSyncProvider'
import { defaultTransition } from '@kobato/ui/lib/motion'
import { ThemeProvider } from '@kobato/ui/lib/ThemeProvider'

export interface DocumentProvidersProps {
  children: ReactNode
}

export function DocumentProviders({ children }: DocumentProvidersProps) {
  const facts = useDocumentFacts()

  return (
    <ThemeProvider initialResolved={facts.theme ?? undefined}>
      <BlogSettingsProvider value={facts.settings}>
        <LazyMotionConfig reducedMotion="user" transition={defaultTransition}>
          <LocaleSyncProvider locale={facts.locale} revision={facts.revision}>
            {children}
          </LocaleSyncProvider>
        </LazyMotionConfig>
      </BlogSettingsProvider>
    </ThemeProvider>
  )
}
