import type { SecuritySettings } from '@kobato/settings/types'

import { CorsPolicyCard } from '@/ui/settings/security/CorsPolicyCard'
import { CsrfExemptPathsCard } from '@/ui/settings/security/CsrfExemptPathsCard'
import { CsrfToggleCard } from '@/ui/settings/security/CsrfToggleCard'
import { PasskeyToggleCard } from '@/ui/settings/security/PasskeyToggleCard'

export function SecurityForm({ security }: { security: SecuritySettings }) {
  return (
    <div className="flex flex-col gap-5">
      <CsrfToggleCard security={security} />
      <CsrfExemptPathsCard security={security} />
      <CorsPolicyCard security={security} />
      <PasskeyToggleCard security={security} />
    </div>
  )
}
