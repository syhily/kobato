import type { ObservabilitySettings } from '@kobato/settings/types'

import { orpcQuery } from '@kobato/api/browser/orpc-query'
import { ObservabilityAssetsCard } from '@kobato/web-admin/ui/settings/observability/ObservabilityAssetsCard'
import { ObservabilityConnectionCard } from '@kobato/web-admin/ui/settings/observability/ObservabilityConnectionCard'
import { ObservabilityReportingCard } from '@kobato/web-admin/ui/settings/observability/ObservabilityReportingCard'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

interface ObservabilityFormProps {
  observability: ObservabilitySettings
  passwordMask: string | null
  rumClientTokenMask: string | null
}

export function ObservabilityForm({ observability, passwordMask, rumClientTokenMask }: ObservabilityFormProps) {
  const queryClient = useQueryClient()
  const { data: status } = useQuery(orpcQuery.admin.observability.status.queryOptions({ input: {} }))

  const invalidateStatus = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.observability.status.key() })
  }, [queryClient])

  return (
    <div className="flex flex-col gap-5">
      <ObservabilityConnectionCard
        observability={observability}
        passwordMask={passwordMask ?? null}
        status={status}
        onStatusInvalidated={invalidateStatus}
      />
      <ObservabilityReportingCard
        observability={observability}
        status={status}
        onStatusInvalidated={invalidateStatus}
      />
      <ObservabilityAssetsCard
        status={status}
        rumClientTokenMask={rumClientTokenMask ?? null}
        onStatusInvalidated={invalidateStatus}
      />
    </div>
  )
}
