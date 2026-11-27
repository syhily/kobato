import { guardLoader } from '@kobato/web-admin/lib/guard-loader'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { AddMusicView } from '@kobato/web-admin/ui/music/AddMusicView'

export const clientLoader = guardLoader('author')

export const meta = titleMeta('meta.title.admin.musicAdd')

export default function AdminMusicAddRoute() {
  return <AddMusicView />
}
