import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { AddMusicView } from '@kobato/web-admin/ui/musics/AddMusicView.tsx'

import { titleMeta } from '@/seo/title-meta.ts'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('meta.title.admin.musicAdd')

export default function AdminMusicAddRoute() {
  return <AddMusicView />
}
