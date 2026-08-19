import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { MusicsView } from '@/ui/admin/musics/MusicsView'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('音乐管理')

export default function WpAdminMusicsRoute() {
  return <MusicsView />
}
