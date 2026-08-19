import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { WebmentionsView } from '@/ui/admin/webmentions/WebmentionsView'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('Webmention 管理')

export default function WpAdminWebmentionsRoute() {
  return <WebmentionsView />
}
