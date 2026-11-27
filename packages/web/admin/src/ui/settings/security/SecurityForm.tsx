import type { SecuritySettings } from '@kobato/settings/types'

import { CorsPolicyCard } from '@kobato/web-admin/ui/settings/security/CorsPolicyCard'
import { CsrfExemptPathsCard } from '@kobato/web-admin/ui/settings/security/CsrfExemptPathsCard'
import { CsrfToggleCard } from '@kobato/web-admin/ui/settings/security/CsrfToggleCard'
import { PasskeyToggleCard } from '@kobato/web-admin/ui/settings/security/PasskeyToggleCard'

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
