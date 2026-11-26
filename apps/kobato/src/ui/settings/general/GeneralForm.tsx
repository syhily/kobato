import type { SiteIdentitySettings } from '@kobato/settings/types'

import { GeneralAuthorCard } from '@/ui/settings/general/GeneralAuthorCard'
import { GeneralFooterCard } from '@/ui/settings/general/GeneralFooterCard'
import { GeneralIdentityCard } from '@/ui/settings/general/GeneralIdentityCard'
import { GeneralTimeZoneCard } from '@/ui/settings/general/GeneralTimeZoneCard'

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
