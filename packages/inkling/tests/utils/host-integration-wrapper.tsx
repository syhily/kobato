import type { CardConfig } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import type { ReactNode } from 'react'

import { InklingHostIntegrationProvider } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import { createHostIntegrationValue } from '@kobato/inkling/tests/utils/host-integration-context'
export function createHostIntegrationWrapper(cardConfig: CardConfig = {}) {
  const value = createHostIntegrationValue({ cardConfig })
  return function HostIntegrationWrapper({ children }: { children: ReactNode }) {
    return <InklingHostIntegrationProvider value={value}>{children}</InklingHostIntegrationProvider>
  }
}
