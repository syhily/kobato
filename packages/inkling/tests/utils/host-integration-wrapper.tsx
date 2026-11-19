import type { CardConfig } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'

import { InklingHostIntegrationProvider } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import { createHostIntegrationValue } from '@kobato/inkling/tests/utils/host-integration-context'
import React from 'react'

export function createHostIntegrationWrapper(cardConfig: CardConfig = {}) {
  const value = createHostIntegrationValue({ cardConfig })
  return function HostIntegrationWrapper({ children }: { children: React.ReactNode }) {
    return <InklingHostIntegrationProvider value={value}>{children}</InklingHostIntegrationProvider>
  }
}
