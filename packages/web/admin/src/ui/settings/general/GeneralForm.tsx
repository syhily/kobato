import type { SiteIdentitySettings } from '@kobato/settings/types'

import { GeneralAuthorCard } from '@kobato/web-admin/ui/settings/general/GeneralAuthorCard'
import { GeneralFooterCard } from '@kobato/web-admin/ui/settings/general/GeneralFooterCard'
import { GeneralIdentityCard } from '@kobato/web-admin/ui/settings/general/GeneralIdentityCard'
import { GeneralTimeZoneCard } from '@kobato/web-admin/ui/settings/general/GeneralTimeZoneCard'

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
