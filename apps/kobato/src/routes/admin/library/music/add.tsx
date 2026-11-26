import { guardLoader } from '@/lib/guard-loader'
import { titleMeta } from '@/seo/title-meta'
import { AddMusicView } from '@/ui/music/AddMusicView'

export const clientLoader = guardLoader('author')

export const meta = titleMeta('meta.title.admin.musicAdd')

export default function AdminMusicAddRoute() {
  return <AddMusicView />
}
