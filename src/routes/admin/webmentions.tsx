import { useSearchParams } from 'react-router'

import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { WebmentionsView, type WebmentionTab } from '@/ui/admin/webmentions/WebmentionsView'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.webmentions')

export default function WpAdminWebmentionsRoute() {
  const [searchParams, setSearchParams] = useSearchParams()
  // `?tab=outbox` deep-links the send log (the task center links here); anything else lands on the inbox.
  const tab: WebmentionTab = searchParams.get('tab') === 'outbox' ? 'outbox' : 'inbox'

  // Tab switches write back into the URL (comments controller precedent: replace + preventScrollReset) so
  // reload/Back keeps the selection.
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
