import type { NavigationSettings, SocialItem } from '@kobato/settings/types.ts'

import { FooterNavCard } from '@kobato/web-admin/ui/settings/navigation/FooterNavCard.tsx'
import { SideNavCard } from '@kobato/web-admin/ui/settings/navigation/SideNavCard.tsx'

interface NavigationEditorProps {
  navigation: NavigationSettings
  socials: SocialItem[]
}

export function NavigationEditor({ navigation, socials }: NavigationEditorProps) {
  return (
    <div className="flex flex-col gap-5">
      <SideNavCard navigation={navigation} />
      <FooterNavCard navigation={navigation} socials={socials} />
    </div>
  )
}
