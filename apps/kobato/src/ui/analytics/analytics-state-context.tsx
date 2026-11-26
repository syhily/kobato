import { createContext, type ReactNode, use } from 'react'

import type { AnalyticsState } from '@/ui/analytics/use-analytics-state'

const AnalyticsStateContext = createContext<AnalyticsState | null>(null)

export function AnalyticsStateProvider({ state, children }: { state: AnalyticsState; children: ReactNode }) {
  return <AnalyticsStateContext value={state}>{children}</AnalyticsStateContext>
}

export function useAnalyticsDashboardState(): AnalyticsState {
  const state = use(AnalyticsStateContext)
  if (!state) {
    throw new Error('analytics dashboard panels must render inside <AnalyticsStateProvider>')
  }
  return state
}
