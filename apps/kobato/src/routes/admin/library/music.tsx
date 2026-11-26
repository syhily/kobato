import { guardLoader } from '@/lib/guard-loader'
import { titleMeta } from '@/seo/title-meta'
import { MusicsView } from '@/ui/music/MusicsView'

export const clientLoader = guardLoader('author')

export const meta = titleMeta('meta.title.admin.music')

export default function WpAdminMusicsRoute() {
  return <MusicsView />
}
