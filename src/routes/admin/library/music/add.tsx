import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { AddMusicView } from '@/ui/admin/musics/AddMusicView'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('meta.title.admin.musicAdd')

export default function AdminMusicAddRoute() {
  return <AddMusicView />
}
