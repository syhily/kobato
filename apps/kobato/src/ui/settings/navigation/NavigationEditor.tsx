import type { NavigationSettings, SocialItem } from '@kobato/settings/types'

import { FooterNavCard } from '@/ui/settings/navigation/FooterNavCard'
import { SideNavCard } from '@/ui/settings/navigation/SideNavCard'

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
