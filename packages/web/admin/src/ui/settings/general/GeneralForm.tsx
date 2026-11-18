import type { SiteIdentitySettings } from '@kobato/settings/types.ts'

import { GeneralAuthorCard } from '@kobato/web-admin/ui/settings/general/GeneralAuthorCard.tsx'
import { GeneralFooterCard } from '@kobato/web-admin/ui/settings/general/GeneralFooterCard.tsx'
import { GeneralIdentityCard } from '@kobato/web-admin/ui/settings/general/GeneralIdentityCard.tsx'
import { GeneralTimeZoneCard } from '@kobato/web-admin/ui/settings/general/GeneralTimeZoneCard.tsx'

interface GeneralFormProps {
  siteIdentity: SiteIdentitySettings
  timeZones: readonly string[]
}

export function GeneralForm({ siteIdentity, timeZones }: GeneralFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <GeneralIdentityCard siteIdentity={siteIdentity} />
      <GeneralFooterCard siteIdentity={siteIdentity} />
      <GeneralAuthorCard siteIdentity={siteIdentity} />
      <GeneralTimeZoneCard siteIdentity={siteIdentity} timeZones={timeZones} />
    </div>
  )
}
