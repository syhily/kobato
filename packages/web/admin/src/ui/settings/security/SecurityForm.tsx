import type { SecuritySettings } from '@kobato/settings/types.ts'

import { CorsPolicyCard } from '@kobato/web-admin/ui/settings/security/CorsPolicyCard.tsx'
import { CsrfExemptPathsCard } from '@kobato/web-admin/ui/settings/security/CsrfExemptPathsCard.tsx'
import { CsrfToggleCard } from '@kobato/web-admin/ui/settings/security/CsrfToggleCard.tsx'
import { PasskeyToggleCard } from '@kobato/web-admin/ui/settings/security/PasskeyToggleCard.tsx'

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
