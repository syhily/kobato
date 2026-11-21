import { guardOnlyLoader } from '@kobato/server/http/request-context'
import { MusicsView } from '@kobato/web-admin/ui/music/MusicsView'

import { titleMeta } from '@/seo/title-meta'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('meta.title.admin.music')

export default function WpAdminMusicsRoute() {
  return <MusicsView />
}
