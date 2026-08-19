import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { AddMusicView } from '@/ui/admin/musics/AddMusicView'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('添加音乐')

export default function AdminMusicAddRoute() {
  return <AddMusicView />
}
