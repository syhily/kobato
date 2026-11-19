import type { ObservabilitySettings } from '@kobato/settings/types.ts'

import { ObservabilityAssetsCard } from '@kobato/web-admin/ui/settings/observability/ObservabilityAssetsCard.tsx'
import { ObservabilityConnectionCard } from '@kobato/web-admin/ui/settings/observability/ObservabilityConnectionCard.tsx'
import { ObservabilityReportingCard } from '@kobato/web-admin/ui/settings/observability/ObservabilityReportingCard.tsx'
import { orpcQuery } from '@kobato/web-client/api/orpc-query.ts'
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

  // One status projection backs all three cards: saves, the connection test and
  // provisioning can each change `verified` / `provisioned` / the runtime phase.
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
