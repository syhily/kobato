import React from 'react'

import type { CardConfig } from '../../src/context/InklingHostIntegrationContext'

import { InklingHostIntegrationProvider } from '../../src/context/InklingHostIntegrationContext'
import { createHostIntegrationValue } from './host-integration-context'

/**
 * The provider wrapper hooks read the host-integration channels through
 * (`useCardMenu`'s gif/library/snippet settings, uploads, …). Shared by the
 * hook/menu specs so the fixture is not re-declared per file.
 */
export function createHostIntegrationWrapper(cardConfig: CardConfig = {}) {
  const value = createHostIntegrationValue({ cardConfig })
  return function HostIntegrationWrapper({ children }: { children: React.ReactNode }) {
    return <InklingHostIntegrationProvider value={value}>{children}</InklingHostIntegrationProvider>
  }
}
