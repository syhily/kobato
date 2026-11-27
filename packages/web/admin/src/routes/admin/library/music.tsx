import { guardLoader } from '@kobato/web-admin/lib/guard-loader'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { MusicsView } from '@kobato/web-admin/ui/music/MusicsView'

export const clientLoader = guardLoader('author')

export const meta = titleMeta('meta.title.admin.music')

export default function WpAdminMusicsRoute() {
  return <MusicsView />
}
