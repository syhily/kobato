import type { CardConfig } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'

import { InklingHostIntegrationProvider } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import { createHostIntegrationValue } from '@kobato/inkling/tests/utils/host-integration-context'
import React from 'react'

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
