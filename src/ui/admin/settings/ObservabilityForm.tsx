import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import type { ObservabilitySettings } from '@/shared/config/types'

import { orpcQuery } from '@/client/api/orpc-query'
import { ObservabilityAssetsCard } from '@/ui/admin/settings/ObservabilityAssetsCard'
import { ObservabilityConnectionCard } from '@/ui/admin/settings/ObservabilityConnectionCard'
import { ObservabilityReportingCard } from '@/ui/admin/settings/ObservabilityReportingCard'

interface ObservabilityFormProps {
  observability: ObservabilitySettings
  /** Last-4 mask of the stored password (`masks.observabilityPasswordMask`). */
  passwordMask: string | null
  /** Last-4 mask of the stored RUM token (`masks.observabilityRumClientTokenMask`). */
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
