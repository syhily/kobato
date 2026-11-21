import { guardOnlyLoader } from '@kobato/server/http/request-context'
import { WebmentionsView, type WebmentionTab } from '@kobato/web-admin/ui/webmentions/WebmentionsView'
import { useSearchParams } from 'react-router'

import { titleMeta } from '@/seo/title-meta'

export const loader = guardOnlyLoader('admin')

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
