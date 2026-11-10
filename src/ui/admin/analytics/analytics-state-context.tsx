import { createContext, type ReactNode, use } from 'react'

import type { AnalyticsState } from '@/ui/admin/analytics/use-analytics-state'

// The ROUTE module owns the `useSearchParams` read (`useAnalyticsState`) and
// passes the state down; deep panels subscribe here instead of re-reading the
// URL, so no ui/ component hides a route-param read.
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
