import { guardOnlyLoader } from '@kobato/server/http/request-context'
import { AddMusicView } from '@kobato/web-admin/ui/music/AddMusicView'

import { titleMeta } from '@/seo/title-meta'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('meta.title.admin.musicAdd')

export default function AdminMusicAddRoute() {
  return <AddMusicView />
}
