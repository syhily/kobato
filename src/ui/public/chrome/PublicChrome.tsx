import type { ReactNode } from 'react'

import type { NavigationItem } from '@/shared/config/types'
import type { HeaderCurrentUser } from '@/ui/public/chrome/Header'

import { BaseLayout } from '@/ui/public/chrome/BaseLayout'
// Static import here (not in BaseLayout) so React Router can preload `public.css`
// during SSR and avoid FOUC. Do NOT re-export from `@/root` — that would pin
// this module in the admin chunk and break the cascade separation.
import '@/styles/public.css'

export interface PublicChromeProps {
  navigation?: NavigationItem[]
  footer?: boolean
  currentUser: HeaderCurrentUser | null
  pathname: string
  search: string
  children?: ReactNode
}

export function PublicChrome({ navigation, footer, currentUser, pathname, search, children }: PublicChromeProps) {
  return (
    <BaseLayout navigation={navigation} footer={footer} currentUser={currentUser} pathname={pathname} search={search}>
      {children}
    </BaseLayout>
  )
}
