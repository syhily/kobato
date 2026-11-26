import { useSearchParams } from 'react-router'

import { guardLoader } from '@/lib/guard-loader'
import { titleMeta } from '@/seo/title-meta'
import { WebmentionsView, type WebmentionTab } from '@/ui/webmentions/WebmentionsView'

export const clientLoader = guardLoader('admin')

export const meta = titleMeta('meta.title.admin.webmentions')

export default function WpAdminWebmentionsRoute() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: WebmentionTab = searchParams.get('tab') === 'outbox' ? 'outbox' : 'inbox'

  const onTabChange = (next: WebmentionTab) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next === 'inbox') {
          params.delete('tab')
        } else {
          params.set('tab', next)
        }
        return params
      },
      { replace: true, preventScrollReset: true },
    )
  }

  return <WebmentionsView tab={tab} onTabChange={onTabChange} />
}
